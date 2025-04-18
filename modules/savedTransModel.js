const mongoose = require("mongoose");

const savedTransSchema = new mongoose.Schema(
  {
    text: {
      type: String,
    },
    translation: {
      type: String,
      required: true,
    },
    fromLang: {
      type: String,
    },
    toLang: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the User model
      required: true,
      select: false,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

savedTransSchema.index({ translation: "text" });

const savedTransModel = mongoose.model("savedTrans", savedTransSchema);

module.exports = savedTransModel;
