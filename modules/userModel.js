const mongoose = require("mongoose");
const validator = require("validator");
const brcypt = require("bcryptjs");
const crypto = require("crypto");
const { type } = require("os");
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Every user should have u name"],
    minlength: 3,
    maxlength: 30,
    unique: true,
  },
  email: {
    type: String,
    required: [true, "Please Provide us with your email!"],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Please provide a vaild email!"],
  },
  password: {
    type: String,
    required: [true, "please provide a password"],
    minlength: 8,
    maxlength: 30,
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, "please provide a confirm password"],
    validate: {
      validator: function (value) {
        return value === this.password;
      },
      message: "Passwords do not match",
    },
  },
  photo: {
    type: String,
    default: "default.jpg",
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  dailyTranslations: {
    count: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
  },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: Date,
  isActive: { type: Boolean, default: false },
  passwordChangedAt: Date,
  /// Eamil Fields 🔔🔔⚠
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
});

/// Hashing Password /
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await brcypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});
///Correct password and compare in login and sign up //
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await brcypt.compare(candidatePassword, userPassword);
};

/// Email Verification Token 🔔🔔
userSchema.methods.createEmailVerifyToken = function () {
  const verifyToken = crypto.randomBytes(32).toString("hex");

  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  this.emailVerificationExpires = Date.now() + 10 * 60 * 1000;

  return verifyToken;
};

/// if user changed password after the token has issued ////////
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changeTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return changeTimestamp > JWTTimestamp;
  }
  return false;
};
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
