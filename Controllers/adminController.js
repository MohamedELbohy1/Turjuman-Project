const savedTransModel = require("../modules/savedTransModel");
const catchAsync = require("express-async-handler");
const AppError = require("./../utils/appError");
const User = require("./../modules/userModel");

exports.getTopActiveUsers = catchAsync(async (req, res, next) => {
  const topUsers = await savedTransModel.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },

    {
      $addFields: {
        _id: { $toObjectId: "$_id" },
      },
    },

    {
      $lookup: {
        from: "users", // Name of the user collection
        localField: "_id", // userId from savedtransModel
        foreignField: "_id", // _id from userModel
        as: "userDetails",
      },
    },

    {
      $project: {
        count: 1,
        user: {
          name: {
            $ifNull: [{ $arrayElemAt: ["$userDetails.name", 0] }, "Unknown"],
          },
          email: {
            $ifNull: [{ $arrayElemAt: ["$userDetails.email", 0] }, "No Email"],
          },
        },
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    data: topUsers,
  });
});

exports.getUsageAnalytics = catchAsync(async (req, res, next) => {
  const totalTranslations = await savedTransModel.countDocuments();

  const activeUsers = await User.countDocuments({
    isActive: { $eq: true },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0); // Start of today

  const dailyTranslations = await savedTransModel.countDocuments({
    createdAt: { $gte: todayStart },
  });

  res.status(200).json({
    status: "success",
    data: {
      totalTranslations,
      activeUsers,
      dailyTranslations,
    },
  });
});
