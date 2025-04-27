const fs = require("fs");
const express = require("express");
const morgan = require("morgan");
const app = express();
const rateLimit = require("express-rate-limit");
const AppErorr = require("./utils/appError");
const cors = require("cors");
const globalErrorHandler = require("./Controllers/errorController");
const userRouter = require("./routes/userRoutes");
const translateRouter = require("./routes/translateRoute");
const paymentRouter = require("./routes/paymentRoute");
const paymentController = require("./Controllers/paymentController");
const compression = require("compression");
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

app.use(compression());

// 🌐 CORS Configuration
// const corsOptions = {
//   origin: ["https://turjuman-project-turjuman.vercel.app"],
//   credentials: true,
//   methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
//   allowedHeaders: "Content-Type,Authorization",
// };
app.use(cors(corsOptions));
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
// app.use("/api", (req, res, next) => {
//   res.setHeader("Content-Type", "application/json");
//   next();
// });

app.get("/", (req, res) => {
  res.send("Welcome to Turjuman API 🚀");
});
app.use("/api/v1/users", userRouter);
app.use("/api/v1/", translateRouter);
app.use("/api/v1/payment", paymentRouter);

app.all("*", (req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Can't find ${req.originalUrl} on this server!`,
  });
});

app.use(globalErrorHandler);
module.exports = app;
