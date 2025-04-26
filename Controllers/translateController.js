const redisClient = require("../utils/radisClient");
const savedTransModel = require("../modules/savedTransModel");
const catchAsync = require("express-async-handler");
const AppError = require("./../utils/appError");
const User = require("./../modules/userModel");
const mongoose = require("mongoose");
// const translate = require("translate-google");
const gemineiTranslate = require("../utils/geminiServce");
const model = require("../utils/geminiModel");
const session = require("express-session");

const getCachedTranslation = async (hotKey, warmKey, coldKey) => {
  const hot = await redisClient.get(hotKey);
  if (hot) return JSON.parse(hot);

  const warm = await redisClient.get(warmKey);
  if (warm) return JSON.parse(warm);

  const cold = await redisClient.get(coldKey);
  if (cold) return JSON.parse(cold);

  return null;
};
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
  const potentialTranslations = await savedTransModel
    .find({
      srcLang: newTranslation.srcLang,
      targetLang: newTranslation.targetLang,
      _id: { $ne: newTranslation._id },
    })
    .select("word translation");

  const similarityPromises = potentialTranslations.map(async (trans) => {
    try {
      const prompt = `
        Compare the semantic similarity between the following two words in the context of translation from ${newTranslation.srcLang} to ${newTranslation.targetLang}. Respond with a JSON object {"similar": true/false, "reason": "short explanation"}.

        Word 1: ${newTranslation.word}
        Word 2: ${trans.word}
      `;
      const result = await model.generateContent(prompt);
      const rawJson = await result.response.text();
      const json = parseGeminiJson(rawJson);
      if (json.similar) {
        return {
          ...trans._doc,
          similarityReason: json.reason,
        };
      }
    } catch (err) {
      console.error(
        `Error comparing ${newTranslation.word} with ${trans.word}:`,
        err.message
      );
    }
    return null;
  });

  const allResults = await Promise.all(similarityPromises);
  return allResults.filter((res) => res !== null).slice(0, 5);
};

exports.translateAndSave = catchAsync(async (req, res, next) => {
  let { word, paragraph, srcLang, targetLang, isFavorite = false } = req.body;

  if (!word || !srcLang || !targetLang) {
    return next(
      new AppError("Please provide word, srcLang , and targetLang 😃", 400)
    );
  }

  const hotCacheKey = `hotcache:translation:${word}:${srcLang}:${targetLang}`;
  const warmCacheKey = `warmcache:translation:${word}:${srcLang}:${targetLang}`;
  const coldCacheKey = `coldcache:translation:${word}:${srcLang}:${targetLang}`;

  const cachedTranslation = await getCachedTranslation(
    hotCacheKey,
    warmCacheKey,
    coldCacheKey
  );

  if (cachedTranslation) {
    return res.status(200).json({
      success: true,
      data: {
        ...cachedTranslation,
        source: cachedTranslation.source || "cache",
      },
    });
  }

  const translationData = await gemineiTranslate(
    word,
    paragraph,
    srcLang,
    targetLang
  );

  if (!translationData.success) {
    if (translationData.error && translationData.error.includes("quota")) {
      return res.status(503).json({
        success: false,
        message:
          "⚠️ Translation service is temporarily unavailable due to rate limits. Please try again in a minute.",
        error: translationData.error,
        fallback: true,
        details: translationData,
      });
    }

    return res.status(500).json({
      success: false,
      message: translationData.error || "❌ Can't find a proper translation",
      details: translationData,
    });
  }

  const translation = translationData.translation;
  const userId = req.user ? req.user.id : null;

  const GUEST_TRANSLATION_LIMIT = process.env.GUEST_LIMIT || 2;
  if (!userId) {
    if (!req.session.guestTranslationCount)
      req.session.guestTranslationCount = 0;

    if (req.session.guestTranslationCount >= GUEST_TRANSLATION_LIMIT) {
      return res.status(403).json({
        success: false,
        message: `You have reached the maximum limit of ${GUEST_TRANSLATION_LIMIT} translations as a guest. Please log in for more translations.`,
      });
    }

    req.session.guestTranslationCount += 1;
    return res.status(200).json({
      success: true,
      data: {
        original: word,
        translation,
        count: req.session.guestTranslationCount,
      },
    });
  }

  const isSingleWord = word.trim().split(/\s+/).length === 1;

  // ✅ Skip saving if not a single word
  if (!isSingleWord) {
    return res.status(200).json({
      success: true,
      data: {
        original: word,
        translation,
        message: "Translation completed (not saved - full sentence)",
      },
    });
  }

  const existingTranslation = await savedTransModel.findOne({
    word,
    srcLang,
    targetLang,
    userId,
  });

  if (existingTranslation) {
    return res.status(200).json({
      success: true,
      message: "Translation already exists",
      data: {
        original: word,
        translation: existingTranslation.translation,
        isFavorite: existingTranslation.isFavorite,
        definition: translationData.definition,
        examples: translationData.examples,
        synonyms_src: translationData.synonyms_src,
        synonyms_target: translationData.synonyms_target,
      },
    });
  }

  const savedTrans = await savedTransModel.create({
    word,
    srcLang,
    targetLang,
    translation,
    userId,
    isFavorite,
    definition: translationData.definition,
    synonyms_src: translationData.synonyms_src,
    synonyms_target: translationData.synonyms_target,
  });

  const similarTranslations = await suggestSimilarTranslations(savedTrans);

  const dictionaryData = {
    definition: translationData.definition,
    examples: translationData.examples,
    synonyms_src: translationData.synonyms_src,
    synonyms_target: translationData.synonyms_target,
  };

  await redisClient.set(
    hotCacheKey,
    JSON.stringify({
      original: word,
      translation,
      ...dictionaryData,
    }),
    { EX: 3600 }
  );
  await redisClient.set(
    warmCacheKey,
    JSON.stringify({
      original: word,
      translation,
      ...dictionaryData,
    }),
    { EX: 86400 }
  );
  await redisClient.set(
    coldCacheKey,
    JSON.stringify({
      original: word,
      translation,
      ...dictionaryData,
    }),
    { EX: 604800 }
  );

  res.status(200).json({
    success: true,
    data: {
      original: word,
      translation,
      ...dictionaryData,
      similarTranslations,
      savedTranslation: savedTrans,
    },
  });
});

exports.getUserTranslation = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Find all saved translations for the logged-in user
  const savedTrans = await savedTransModel.find({ userId, _id: id });

  // Format the response to include original text and its translation
  const translations = savedTrans.map((trans) => ({
    id: trans._id,
    originalText: trans.word,
    translation: trans.translation,
    srcLang: trans.srcLang,
    targetLang: trans.targetLang,
    definition: trans.definition,
    synonyms_src: trans.synonyms_src,
    synonyms_target: trans.synonyms_target,
  }));

  res.status(200).json({
    status: "success",
    data: translations,
  });
});

exports.getalltranslations = catchAsync(async (req, res, next) => {
  const translations = await savedTransModel.find().sort({ createdAt: -1 });

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
  const favorites = await savedTransModel
    .find({ userId, isFavorite: true })
    .sort({ createdAt: -1 });

  // Format the response to include original text and its translation
  const favoriteTranslations = favorites.map((trans) => ({
    id: trans.id,
    originalText: trans.word,
    translation: trans.translation,
    srcLang: trans.srcLang,
    targetLang: trans.targetLang,
    isFavorite: trans.isFavorite,
    createdAt: trans.createdAt,
    definition: trans.definition,
    synonyms_src: trans.synonyms_src,
    synonyms_target: trans.synonyms_target,
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
    const {
      word,
      paragraph,
      srcLang,
      targetLang,
      startDate,
      endDate,
      isFavorite,
    } = req.query;

    const query = { userId: req.user.id }; // Match only translations for the authenticated user

    if (word) {
      query.$text = { $search: word };
    }
    if (paragraph) {
      query.$text = { $search: paragraph };
    }

    if (srcLang) {
      query.srcLang = srcLang; // Filter by source language
    }

    if (targetLang) {
      query.targetLang = targetLang; // Filter by target language
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

////    The Function above but this userTranslations is simple      /////
exports.userTanslations = async (req, res) => {
  try {
    const {
      word,
      paragraph,
      srcLang,
      targetLang,
      startDate,
      endDate,
      isFavorite,
    } = req.query;

    const query = { userId: req.user.id };
    const translations = await savedTransModel
      .find(query)
      .sort({ createdAt: -1 }); // من الأحدث للأقدم

    res.status(200).json({
      status: "success",
      results: translations.length,
      data: translations,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Server Error" });
  }
};

exports.markAsFavoriteById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const translation = await savedTransModel
    .findOne({
      _id: id,
      userId,
    })
    .sort({ createdAt: -1 });

  if (!translation) {
    return next(
      new AppError("Translation not found or you don't have permission.", 404)
    );
  }

  translation.isFavorite = true;
  await translation.save();

  res.status(200).json({
    success: true,
    message: "Translation marked as favorite ✅",
    data: translation,
  });
});
