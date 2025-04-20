const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const app = require("./app");
mongoose
  .connect(process.env.DATABASE)
  .then((con) => {
    console.log("DB Connected Succssefly");
  })
  .catch((err) => {
    console.log(`There was and error ${err}`);
    process.exit(1);
  });

//mongoose.connect(process.env.DATABASE_LOCAL,{
// mongoose
//   .connect(DB, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("DB connestions Successful"));

//console.log(process.env);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App running on Port ${port}`);
});

process.on("uncaughtException", (err) => {
  console.log(`uncaughtException error: ${err.name}|${err.message}`);
  port.close(() => {
    console.log("Shutting Down The Server....");
    process.exit(1);
  });
});
