const mongoose = require("mongoose");

const savedTransSchema = new mongoose.Schema(
  {
    word: {
      type: String,
    },
    translation: {
      type: String,
      required: true,
    },
    paragraph: {
      type: String,
    },
    srcLang: {
      type: String,
    },
    targetLang: {
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
      select: true,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    definition: String,
    synonyms_src: [String],
    synonyms_target: [String],
    examples: {
      type: [String],
      default: [],
    },
    level: {
      type: String,
      default: "Medium",
    },
  },
  { timestamps: true }
);
savedTransSchema.index({ word: "text" });

savedTransSchema.pre(/^find/, function (next) {
  this.populate({
    path: "userId",
    select: "email",
  });
  next();
});

const savedTransModel = mongoose.model("savedTrans", savedTransSchema);

module.exports = savedTransModel;
