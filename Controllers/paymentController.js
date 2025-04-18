const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../modules/userModel");
const catchAsync = require("./../utils/catchAsync");

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const user = req.user;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user._id.toString(),
    line_items: [
      {
        price_data: {
          currency: "egp",
          product_data: {
            name: "Turjuman Premium Plan",
            description: "Unlimited translations for 30 days",
          },
          unit_amount: 100 * 100,
        },
        quantity: 1,
      },
    ],
    success_url: `${req.protocol}://${req.get("host")}/`,
    cancel_url: `${req.protocol}://${req.get("host")}/`,
  });

  res.status(200).json({
    status: "success",
    session,
  });
});

exports.webhookCheckout = async (req, res, next) => {
  console.log("🎯 Webhook HIT!");

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email = session.customer_email;

    await User.findOneAndUpdate(
      { email },
      {
        isPremium: true,
        premiumExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }
    );
  }

  res.status(200).json({ received: true });
};
