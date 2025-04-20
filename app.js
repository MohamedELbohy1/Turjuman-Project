const fs = require("fs");
const express = require("express");
const morgan = require("morgan");
const app = express();
const rateLimit = require("express-rate-limit");
const AppErorr = require("./utils/appError");
const globalErrorHandler = require("./Controllers/errorController");
const userRouter = require("./routes/userRoutes");
const translateRouter = require("./routes/translateRoute");
const paymentRouter = require("./routes/paymentRoute");
const paymentController = require("./Controllers/paymentController");

const session = require("express-session");
const cookieParser = require("cookie-parser");

//console.log(process.env.NODE_ENV);
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Rate limiting on Requests On Translate Route
const limiter = rateLimit({
  max: 10,
  windowMs: 2 * 60 * 60 * 1000,
  message:
    "You have reached your limit of Loging in , please try again in 2 hours or Reset Password",
});
app.use("/api/v1/users/login", limiter);

app.post(
  "/webhook-checkout",
  express.raw({ type: "application/json" }),
  paymentController.webhookCheckout
); ////////////////////

//Body Praser, reading from body from req.body
app.use(express.json({ limit: "10kb" })); //Middleware
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

app.use(express.static(`${__dirname}/public`));
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});
app.get("/", (req, res) => {
  res.send("Welcome to Turjuman API 🚀");
});
app.use("/api/v1/users", userRouter);
app.use("/api/v1/", translateRouter);
app.use("/api/v1/payment", paymentRouter);

app.all("*", (req, res, next) => {
  next(new AppErorr(`Cant find ${req.originalUrl} on this srever!`, 404));
});
app.use(globalErrorHandler);
module.exports = app;
