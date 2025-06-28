const express = require("express");
const userController = require("./../Controllers/controllerUser");
const authController = require("./../Controllers/authController");
const adminController = require("./../Controllers/adminController");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/logout", authController.logout);
router.post("/forgotPassword", authController.forgotPassword);
router.patch("/resetPassword/:token", authController.resetPassword);
// router.get("/refresh-token", authController.refreshAccessToken);
// Email verify Route 🔔🔔
router.get("/verify-email/:token", authController.verifyEmail);

router.use(authController.protect);

router.get("/getMe", userController.getMe, userController.getUser);
router.patch(
  "/updateMe",
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe
);
router.delete("/deleteMe", userController.deleteMe);
router.patch("/updateUser/:id", userController.updateUser);
router.delete("/deleteUser/:id", userController.deleteMe);
router.patch("/updateMyPassword", authController.updatePassword);

router.use(authController.restricTo("admin"));

router.get("/top-users", adminController.getTopActiveUsers);
router.get("/Usage-Analytics", adminController.getUsageAnalytics);
router.route("/").get(userController.getAllUsers);
router.route("/getUser/:id").get(userController.getUser);

module.exports = router;
