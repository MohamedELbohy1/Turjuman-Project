const express = require("express");
const authController = require("./../Controllers/authController");
const paymentController = require("./../Controllers/paymentController.js");

const router = express.Router();

router.get(
  "/checkout-session",
  authController.protect,
  paymentController.getCheckoutSession
);

module.exports = router;
