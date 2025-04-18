const catchAsync = require("express-async-handler");
const AppError = require("../utils/appError");
const APIfeatures = require("../utils/ApiFeatures");

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id, {
      active: false,
    });

    if (!doc) {
      return next(
        new AppError(
          `No Document Found With This id${req.params.id} To Delete`,
          404
        )
      );
    }

    res.status(200).json({
      status: "success",
      message: "Document deleted Successfully",
    });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return next(
        new AppError(`No Document found with ID ${req.params.id}`, 404)
      );
    }

    res.status(200).json({
      status: "success",
      data: doc,
    });
  });

exports.getOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) {
      return next(
        new AppError(
          `There is not a Document with this id ${req.params.id}`,
          402
        )
      );
    }
    res.status(200).json({
      status: "success",
      data: doc,
    });
  });

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    const features = new APIfeatures(Model.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .pagination();

    const docs = await features.mongoesquery;

    // Check if the docs array is empty
    if (docs.length === 0) {
      return next(new AppError("No Documents found", 404)); // Use 404 for "not found" status
    }

    res.status(200).json({
      status: "success",
      result: docs.length,
      data: docs,
    });
  });
