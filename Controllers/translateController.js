const savedTransModel = require("../modules/savedTransModel");
const catchAsync = require("express-async-handler");
const AppError = require("./../utils/appError");
const User = require("./../modules/userModel");
const mongoose = require("mongoose");
const translate = require("translate-google");
const session = require("express-session");

exports.checkTranslationLimit = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next();
  }
  const userId = req.user.id;
  console.log(`Checking daily limit for user: ${userId}`);

  const user = await User.findById(userId);

  if (!user) {
    return next(new AppError("User not found", 401));
  }

  if (!user.dailyTranslations) {
    user.set({
      dailyTranslations: {
        count: 0,
        date: new Date(),
      },
    });
    await user.save({ validateModifiedOnly: true });
  }

  const currentDate = new Date().toISOString().split("T")[0];
  const lastActivityDate = new Date(user.dailyTranslations.date)
    .toISOString()
    .split("T")[0];

  // Reset count if it's a new day
  if (currentDate !== lastActivityDate) {
    user.set({
      dailyTranslations: {
        count: 0,
        date: new Date(),
      },
    });
    await user.save({ validateModifiedOnly: true });
  }

  const dailyLimit = user.isPremium ? 100 : 100; // Example: Premium users get 100 translations; free-tier gets 2
  if (user.dailyTranslations.count >= dailyLimit) {
    return next(
      new AppError(
        `Daily translation limit of ${dailyLimit} reached. Upgrade to premium for more translations.`,
        403
      )
    );
  }

  // Increment count and save
  user.set({
    dailyTranslations: {
      count: user.dailyTranslations.count + 1, // Increment count
      date: user.dailyTranslations.date, // Keep the same date
    },
  });
  await user.save({ validateModifiedOnly: true });

  console.log(`Daily translations updated: ${user.dailyTranslations}`);

  next();
});

const suggestSimilarTranslations = async (newTranslation) => {
  const similarTranslations = await savedTransModel
    .find({
      $text: { $search: newTranslation.text },
      fromLang: newTranslation.fromLang,
      toLang: newTranslation.toLang,
      _id: { $ne: newTranslation._id },
    })
    .select("text translation")
    .limit(5);
  return similarTranslations;
};

exports.translateAndSave = catchAsync(async (req, res, next) => {
  const { text, fromLang, toLang, isFavorite = false } = req.body;
  // Validate inputs
  if (!text || !fromLang || !toLang) {
    return next(new AppError("Please provide text, fromLang, and toLang", 400));
  }

  const translations = await translate(text, { from: fromLang, to: toLang });

  if (!translations) {
    return next(
      new AppError(
        ` Translation from ${fromLang} to ${toLang} is not supported`,
        400
      )
    );
  }

  //   let result = translations[text.toLowerCase()]; // Direct match
  //   if (!result) {
  //     result = text
  //       .split(" ") // Split text into words by space
  //       .map((word) => translations[word.toLowerCase()] || word) // Translate each word or keep it as is
  //       .join(" "); // Rejoin translated words into a sentence
  //   }
  const userId = req.user ? req.user.id : null;

  if (!userId) {
    const GUEST_TRANSLATION_LIMIT = 2;
    if (!req.session.guestTranslationCount) {
      req.session.guestTranslationCount = 0;
    }

    if (req.session.guestTranslationCount >= GUEST_TRANSLATION_LIMIT) {
      return res.status(403).json({
        status: "fail",
        message: `You have reached the maximum limit of ${GUEST_TRANSLATION_LIMIT} translations as a guest. Please log in for more translations.`,
      });
    }

    req.session.guestTranslationCount += 1;
    return res.status(200).json({
      status: "success",
      data: {
        original: text,
        translation: translations,
        count: req.session.guestTranslationCount,
      },
    });
  }

  const existingTranslation = await savedTransModel.findOne({
    text,
    fromLang,
    toLang,
    userId,
  });

  if (existingTranslation) {
    return res.status(200).json({
      status: "success",
      message: "Translation already saved",
      data: {
        original: text,
        translation: existingTranslation.translation,
        isFavorite: existingTranslation.isFavorite,
      },
    });
  }

  // Save the new translation to the database
  const savedTrans = await savedTransModel.create({
    text,
    fromLang,
    toLang,
    translation: translations,
    userId,
    isFavorite,
  });

  const similarTranslations = await suggestSimilarTranslations(savedTrans);

  // Respond with the translation and saved entry
  res.status(200).json({
    status: "success",
    data: {
      original: text,
      translation: translations,
      savedTranslation: savedTrans,
      similarTranslations,
    },
  });
});

exports.getUserTranslation = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // Find all saved translations for the logged-in user
  const savedTrans = await savedTransModel.find({ userId });

  // Format the response to include original text and its translation
  const translations = savedTrans.map((trans) => ({
    originalText: trans.text,
    translation: trans.translation,
    fromLang: trans.fromLang,
    toLang: trans.toLang,
    id: trans.id,
  }));

  res.status(200).json({
    status: "success",
    count: translations.length,
    data: translations,
  });
});

exports.getalltranslations = catchAsync(async (req, res, next) => {
  const translations = await savedTransModel.find();

  res.status(200).json({
    status: "success",
    result: translations.length,
    data: {
      translations,
    },
  });
});

exports.getFavorites = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // Find all saved translations for the logged-in user with favorites set to true
  const favorites = await savedTransModel.find({ userId, isFavorite: true });

  // Format the response to include original text and its translation
  const favoriteTranslations = favorites.map((trans) => ({
    id: trans.id,
    originalText: trans.text,
    translation: trans.translation,
  }));

  res.status(200).json({
    status: "success",
    length: favoriteTranslations.length,
    data: favoriteTranslations,
  });
});

exports.deleteTranslationById = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const deletedTranslation = await savedTransModel.findOneAndDelete({
    _id: id,
    userId,
  });

  if (!deletedTranslation) {
    return next(
      new AppError(`No translation found with ID ${id} for this user.`, 404)
    );
  }

  res.status(200).json({
    status: "success",
    message: "Translation deleted successfully",
  });
});

const getTranslationStats = async (userId) => {
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const dailyStats = await savedTransModel.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfDay },
      },
    },
    { $group: { _id: "$toLang", count: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        translations: {
          $push: { toLang: "$_id", count: "$count" },
        },
        dailyTotal: { $sum: "$count" },
      },
    },
  ]);
  const weeklyStats = await savedTransModel.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfWeek },
      },
    },
    { $group: { _id: "$toLang", count: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        translations: {
          $push: { toLang: "$_id", count: "$count" },
        },
        weeklyTotal: { $sum: "$count" },
      },
    },
  ]);
  const monthlyStats = await savedTransModel.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfMonth },
      },
    },
    { $group: { _id: "$toLang", count: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        translations: {
          $push: { toLang: "$_id", count: "$count" },
        },
        monthlyTotal: { $sum: "$count" },
      },
    },
  ]);

  const mostSelectedLanguages = await savedTransModel.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: { fromLang: "$fromLang", toLang: "$toLang" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 2 },
  ]);
  return {
    daily: dailyStats[0] || { translations: [], total: 0 },
    weekly: weeklyStats[0] || { translations: [], total: 0 },
    monthly: monthlyStats[0] || { translations: [], total: 0 },
    mostSelectedLanguages:
      mostSelectedLanguages.length > 0 ? mostSelectedLanguages : [],
  };
};

exports.getTranslationHistory = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const stats = await getTranslationStats(userId);

  res.status(200).json({
    status: "success",
    data: stats,
  });
});

exports.getSorting = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { sortBy = "text", sortOrder = "asc" } = req.query; // Default sorting by text in ascending order

  // Define sorting options
  let sortOptions = {};
  if (sortBy === "text") {
    sortOptions.text = sortOrder === "desc" ? -1 : 1;
  } else if (sortBy === "createdAt") {
    sortOptions.createdAt = sortOrder === "desc" ? -1 : 1;
  }

  // Fetch and sort favorite translations
  const favorites = await savedTransModel
    .find({ userId, isFavorite: true })
    .collation({ locale: "en", strength: 2 }) // Case-insensitive sorting
    .sort(sortOptions);

  // Format the response data
  const favoriteTranslations = favorites.map((trans) => ({
    id: trans.id,
    originalText: trans.text.trim(), // Ensure trimmed output
    translation: trans.translation,
    createdAt: trans.createdAt,
  }));

  // Return sorted favorites
  res.status(200).json({
    status: "success",
    length: favoriteTranslations.length,
    data: favoriteTranslations,
  });
});

exports.searchAndFilterTranslations = async (req, res) => {
  try {
    const { keyword, fromLang, toLang, startDate, endDate, isFavorite } =
      req.query;

    const query = { userId: req.user.id }; // Match only translations for the authenticated user

    if (keyword) {
      query.$text = { $search: keyword };
    }

    if (fromLang) {
      query.fromLang = fromLang; // Filter by source language
    }

    if (toLang) {
      query.toLang = toLang; // Filter by target language
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate); // Start date
      if (endDate) query.createdAt.$lte = new Date(endDate); // End date
    }

    if (isFavorite !== undefined) {
      query.isFavorite = isFavorite === "true";
    }

    const translations = await savedTransModel.find(query);

    res.status(200).json({
      status: "success",
      length: translations.length,
      data: translations,
    });
  } catch (err) {
    res.status(500).json({
      status: "fail",
      message: err.message,
    });
  }
};
