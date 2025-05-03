const { promisify } = require("util");
const User = require("../modules/userModel");
// const catchAsync = require("../utils/catchAsync");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const AppError = require("./../utils/appError");
const crypto = require("crypto");
const Email = require("./../utils/email");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === "production") cookieOptions.secure = true;
  res.cookie("jwt", token, cookieOptions);

  user.password = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

exports.signup = asyncHandler(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
    dailyTranslations: req.body.dailyTranslations,
  });

  // 🔥 Generate verification token
  const verifyToken = newUser.createEmailVerifyToken();
  await newUser.save({ validateBeforeSave: false });

  // 🔥 Prepare Verification URL
  const verificationURL = `http://localhost:3000/api/v1/users/verify-email/${verifyToken}`;

  const email = new Email(newUser, verificationURL);
  await email.sendVerificationEmail();
  createSendToken(newUser, 200, res);
});
/// Login /////
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password.", 400));
  }

  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Invalid email or password.", 401));
  }

  // 3) Check if user is verified 🔔🔔🔔
  if (!user.isEmailVerified) {
    return next(
      new AppError("Please verify your email before logging in.", 401)
    );
  }

  // 4) Send token if everything is ok
  createSendToken(user, 200, res);
});

//  verifyEmail function 🔔🔔🔔
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const token = req.params.token;

  if (!token) {
    return next(new AppError("Token is missing.", 400));
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  console.log("Token received:", token);
  console.log("Hashed token:", hashedToken);

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }, // لسه صالح
  });

  if (!user) {
    return next(new AppError("Token is invalid or has expired.", 400));
  }
  console.log(user);

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: "success",
    message: "Email verified successfully!",
  });
});

exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    status: "success",
    message: "Logged out successfully!",
  });
};

/// Protect Routes /////
exports.protectUserTranslate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer")
    ? req.headers.authorization.split(" ")[1]
    : req.cookies?.jwt;

  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      req.user = null;
      return next();
    }
    // ✅ New: Check if user verified email
    if (!currentUser.isEmailVerified) {
      return next(
        new AppError(
          "Please verify your email before accessing this route.",
          403
        )
      );
    }

    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError(
          "The user recently changed password!,please login again.",
          401
        )
      );
    }
    req.user = currentUser;
    next();
  } catch (err) {
    return next();
  }
});

exports.protect = asyncHandler(async (req, res, next) => {
  // 1️⃣ Get token from header or cookie
  const token = req.headers.authorization?.startsWith("Bearer")
    ? req.headers.authorization.split(" ")[1]
    : req.cookies?.jwt;
  if (!token) {
    return next(
      new AppError("Your are not logged in , please login agin", 401)
    );
  }
  try {
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(
        new AppError("The user is belonging to token is no longer exists", 401)
      );
    }
    // ✅ New: Check if user verified email
    if (!currentUser.isEmailVerified) {
      return next(
        new AppError(
          "Please verify your email before accessing this route.",
          403
        )
      );
    }

    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError(
          "The user recently changed password!,please login again.",
          401
        )
      );
    }
    req.user = currentUser;
    next();
  } catch (err) {
    return next(
      new AppError("Your are not logged in , please login agin", 401)
    );
  }
});

exports.forgotPassword = async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email }); // Fetch user by email
  if (!user) {
    return next(new AppError("There is no user with this email address", 404));
  }

  // 1) Generate the reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 2) Create the reset URL
  const resetURL = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/users/resetPassword/${resetToken}`;

  // 3) Send it to the user's email
  try {
    const email = new Email(user, resetURL);
    await email.sendPasswordReset();

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpired = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        "There was an error sending the email. Try again later!",
        500
      )
    );
  }
};

exports.resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpired: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Token is invalid or expired!", 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpired = undefined;
  await user.save();

  createSendToken(user, 200, res);
});

exports.restricTo = (...roles) => {
  // roles is an array of ['admin'] return is the middleware fun
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this!", 403)
      );
    }
    next();
  };
};

exports.updatePassword = asyncHandler(async (req, res, next) => {
  // 1) Get user based on collection
  const user = await User.findById(req.user.id).select("+password");
  //2) check  if POSTed current user is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError("your current password is wrong", 401));
  }
  //3) if so , update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  //4) log in user,send JWT
  createSendToken(user, 200, res);
});
