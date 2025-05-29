const express = require("express")
const router = express.Router()
const Order = require("../models/Order")
const { notifyAdmin, assignPurchaseRole } = require("../bot")
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/webhook", async (req, res) => {
  // NowPayments webhook
  const { order_id, payment_status, payment_id } = req.body

  if (payment_status === "finished") {
    const order = await Order.findById(order_id).populate("productId")
    if (order) {
      order.paid = true
      order.status = "paid"
      order.paymentId = payment_id
      await order.save()

      // Assign role if product has one
      await assignPurchaseRole(order)

      // Notify admin
      await notifyAdmin(
        order.guildId,
        order.clientId,
        `New payment received!\nOrder: #${order._id}\nProduct: ${order.productId.name}\nAmount: $${order.amount}`,
      )
    }
  }

  res.status(200).send("OK")
})

router.post("/manual-confirm/:orderId", async (req, res) => {
  const order = await Order.findById(req.params.orderId).populate("clientId")

  order.paid = true
  order.status = "paid"
  await order.save()

  // Assign role if product has one
  await assignPurchaseRole(order)

  await notifyAdmin(order.guildId, order.clientId._id, `Payment manually confirmed!\nOrder: #${order._id}`)

  res.json({ success: true })
})

// Stripe Webhook
router.post("/stripe-webhook", express.raw({type: 'application/json'}), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const discordUserId = session.metadata?.discordUserId;
    const order = await Order.findOne({
      userId: discordUserId,
      amount: session.amount_total / 100,
      paymentMethod: 'stripe',
      paid: { $ne: true }
    });
    if (order) {
      order.paid = true;
      order.status = "paid";
      order.paymentId = session.payment_intent;
      await order.save();
      await assignPurchaseRole(order);
      await notifyAdmin(order.guildId, order.clientId, `Stripe-Zahlung erhalten! Order: #${order._id}`);
    }
  }

  // Subscription-Events
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    // Finde Order mit dieser Subscription-ID
    const order = await Order.findOne({ subscriptionId });
    if (order) {
      order.paid = true;
      order.status = 'paid';
      order.subscriptionStatus = 'active';
      order.nextPaymentDate = new Date(invoice.lines.data[0]?.period?.end * 1000);
      await order.save();
      await assignPurchaseRole(order);
      await notifyAdmin(order.guildId, order.clientId, `Abo-Zahlung erhalten! Order: #${order._id}`);
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const subscriptionId = subscription.id;
    const order = await Order.findOne({ subscriptionId });
    if (order) {
      order.subscriptionStatus = 'cancelled';
      order.status = 'cancelled';
      await order.save();
      // Hier ggf. Leistung entziehen
    }
  }
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    const order = await Order.findOne({ subscriptionId });
    if (order) {
      order.subscriptionStatus = 'expired';
      order.status = 'cancelled';
      await order.save();
      // Hier ggf. Leistung entziehen
    }
  }

  res.status(200).send("OK");
});

module.exports = router
