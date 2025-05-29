const express = require("express")
const router = express.Router()
const Client = require("../models/Client")
const Product = require("../models/Product")
const Order = require("../models/Order")
const Feedback = require('../models/Feedback')
const Coupon = require('../models/Coupon')

// API Authentication Middleware
const authenticateAPI = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"]

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" })
  }

  const client = await Client.findOne({ apiKey })
  if (!client) {
    return res.status(403).json({ error: "Invalid API key" })
  }

  req.client = client
  next()
}

router.get("/products", async (req, res) => {
  const products = await Product.find({
    active: true,
  })

  res.json(products)
})

router.get("/orders", async (req, res) => {
  const { guildId, userId, status } = req.query

  const query = {}
  if (guildId) query.guildId = guildId
  if (userId) query.userId = userId
  if (status) query.status = status

  const orders = await Order.find(query).populate("productId")
  res.json(orders)
})

router.post("/order/:orderId/status", async (req, res) => {
  const { status } = req.body

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId },
    { status },
    { new: true },
  )

  if (!order) {
    return res.status(404).json({ error: "Order not found" })
  }

  res.json(order)
})

// Einzelnes Produkt als JSON (für Bearbeitungsmodal)
router.get("/product/:productId", async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) return res.status(404).json({ error: "Produkt nicht gefunden" });
  res.json(product);
});

// Gibt die zugewiesene Ressource für eine Order zurück
router.get('/order/:orderId/resource', async (req, res) => {
  const discordUserId = req.session.userId || (req.session.user && req.session.user.id);
  if (!discordUserId) {
    return res.status(401).json({ error: "Nicht eingeloggt" });
  }
  const order = await require('../models/Order').findById(req.params.orderId);
  if (!order || order.userId !== discordUserId) {
    return res.status(403).json({ error: "Kein Zugriff auf diese Bestellung" });
  }
  const resource = await require('../models/Resource').findOne({ assignedToOrder: req.params.orderId });
  if (!resource) return res.json({});
  res.json(resource);
});

// Feedback abgeben
router.post('/feedback', async (req, res) => {
  const { orderId, userId, sterne, kommentar } = req.body;
  if (!orderId || !userId || !sterne) return res.status(400).json({ error: 'Fehlende Felder' });
  // Prüfe, ob Order existiert und dem User gehört
  const order = await require('../models/Order').findById(orderId);
  if (!order || order.userId !== userId) return res.status(403).json({ error: 'Keine Berechtigung für diese Bestellung' });
  // Feedback speichern
  await Feedback.create({ orderId, userId, sterne, kommentar });
  res.json({ success: true });
});

router.post('/coupon/check', async (req, res) => {
  const { code, orderTotal } = req.body;
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), active: true });
  if (!coupon) return res.json({ valid: false, message: "Coupon ungültig." });

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return res.json({ valid: false, message: "Coupon abgelaufen." });
  }
  if (coupon.maxRedemptions > 0 && coupon.redemptions >= coupon.maxRedemptions) {
    return res.json({ valid: false, message: "Coupon-Limit erreicht." });
  }
  if (orderTotal < coupon.minOrder) {
    return res.json({ valid: false, message: `Mindestbestellwert: €${coupon.minOrder}` });
  }

  let discount = 0;
  if (coupon.type === "percent") {
    discount = Math.round(orderTotal * (coupon.value / 100) * 100) / 100;
  } else {
    discount = Math.min(orderTotal, coupon.value);
  }

  res.json({
    valid: true,
    discount,
    type: coupon.type,
    value: coupon.value,
    message: `Coupon gültig: -${coupon.type === 'percent' ? coupon.value + '%' : '€' + coupon.value}`
  });
});

module.exports = router
