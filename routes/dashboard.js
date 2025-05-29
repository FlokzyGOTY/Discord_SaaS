const express = require("express")
const router = express.Router()
const { requireAuth, requireGuildAccess } = require("../middleware/auth")
const Client = require("../models/Client")
const Product = require("../models/Product")
const Order = require("../models/Order")
const bot = require("../bot")
const Resource = require('../models/Resource')
const Shop = require('../models/Shop')
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const Coupon = require('../models/Coupon');

router.get("/", requireAuth, async (req, res) => {
  const client = await Client.findOne({ discordId: req.session.user.id })
  const guilds = req.session.user?.guilds || []

  // IDs der Server, auf denen der Bot ist
  const botGuildIds = bot.guilds.cache.map(guild => guild.id)

  // Für jedes Guild-Objekt merken, ob der Bot drauf ist
  const guildsWithBot = guilds.map(guild => ({
    ...guild,
    botIsIn: botGuildIds.includes(guild.id)
  }))

  res.render("dashboard/index", {
    user: req.session.user,
    guilds: guildsWithBot,
    client,
    botInviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
  })
})

router.get("/guild/:guildId", requireAuth, requireGuildAccess, async (req, res) => {
  const products = await Product.find({ clientId: req.client._id, guildId: req.guildId })
  const orders = await Order.find({
    clientId: req.client._id,
    guildId: req.guildId,
  }).populate("productId")

  // Finde die Guild-Konfiguration für diesen Server oder verwende die Legacy-Konfiguration
  const guildConfig = req.client.guildConfigs.find(config => config.guildId === req.guildId) || {}
  
  // Kombiniere die Guild-Konfiguration mit der Legacy-Konfiguration für Abwärtskompatibilität
  const combinedConfig = {
    paypalLink: guildConfig.paypalLink || req.client.config.paypalLink,
    nowPaymentsKey: guildConfig.nowPaymentsKey || req.client.config.nowPaymentsKey,
    adminChannelId: guildConfig.adminChannelId || req.client.config.adminChannelId,
    shopName: guildConfig.shopName || req.client.config.shopName,
    ticketCategoryId: guildConfig.ticketCategoryId || req.client.config.ticketCategoryId,
    supportRoleId: guildConfig.supportRoleId || req.client.config.supportRoleId
  }

  // Erstelle ein erweitertes Client-Objekt mit der serverspezifischen Konfiguration
  const clientWithGuildConfig = {
    ...req.client.toObject(),
    config: combinedConfig,
    shopSlug: guildConfig.shopSlug || req.client.shopSlug
  }

  // NEU: Zähle alle Ressourcen (global)
  const allResourcesCount = await require('../models/Resource').countDocuments();

  res.render("dashboard/guild", {
    user: req.session.user,
    guild: req.session.user.guilds.find((g) => g.id === req.guildId),
    client: clientWithGuildConfig,
    products,
    orders,
    allResourcesCount, // NEU
  })
})

router.post("/guild/:guildId/settings", requireAuth, requireGuildAccess, async (req, res) => {
  const { paypalLink, nowPaymentsKey, adminChannelId, shopName, shopSlug, ticketCategoryId, supportRoleId } = req.body

  // Überprüfe, ob der Shop-Slug bereits verwendet wird (von einem anderen Client oder einer anderen Guild-Konfiguration)
  if (shopSlug) {
    const existingWithSlug = await Client.findOne({
      $or: [
        { shopSlug: shopSlug, _id: { $ne: req.client._id } },
        { "guildConfigs.shopSlug": shopSlug, _id: { $ne: req.client._id } }
      ]
    })

    if (existingWithSlug) {
      return res.status(400).json({ error: "Shop slug already taken" })
    }
  }

  // Finde oder erstelle die Guild-Konfiguration für diesen Server
  let guildConfig = req.client.guildConfigs.find(config => config.guildId === req.guildId)
  if (!guildConfig) {
    guildConfig = { guildId: req.guildId };
    req.client.guildConfigs.push(guildConfig);
  }
  
  // Aktualisiere die Guild-Konfiguration
  guildConfig.paypalLink = paypalLink;
  guildConfig.nowPaymentsKey = nowPaymentsKey;
  guildConfig.adminChannelId = adminChannelId;
  guildConfig.shopName = shopName;
  guildConfig.shopSlug = shopSlug;
  guildConfig.ticketCategoryId = ticketCategoryId;
  guildConfig.supportRoleId = supportRoleId;

  // Entferne den Slug von der Root-Ebene, wenn er jetzt in einer GuildConfig gespeichert ist
  if (req.client.shopSlug === shopSlug) {
    req.client.shopSlug = undefined;
  }

  await req.client.save()
  res.redirect(`/dashboard/guild/${req.guildId}`)
})

router.post("/guild/:guildId/product", requireAuth, requireGuildAccess, upload.single('imageFile'), async (req, res) => {
  const { name, description, price, roleId } = req.body;
  let imageUrl = "";
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  }
  const product = new Product({
    clientId: req.client._id,
    guildId: req.guildId,
    name,
    description,
    price: Number.parseFloat(price),
    roleId: roleId || null,
    imageUrl
  });
  await product.save();
  res.redirect(`/dashboard/guild/${req.guildId}`);
})

router.post("/guild/:guildId/product/:productId/delete", requireAuth, requireGuildAccess, async (req, res) => {
  await Product.findOneAndDelete({
    _id: req.params.productId,
    clientId: req.client._id,
  })

  res.redirect(`/dashboard/guild/${req.guildId}`)
})

// Produkt bearbeiten (Formular anzeigen)
router.get("/guild/:guildId/product/:productId/edit", requireAuth, requireGuildAccess, async (req, res) => {
  const product = await Product.findOne({
    _id: req.params.productId,
    clientId: req.client._id,
    guildId: req.guildId
  });
  if (!product) return res.status(404).send("Produkt nicht gefunden");

  res.render("dashboard/product_edit", {
    user: req.session.user,
    guild: req.session.user.guilds.find((g) => g.id === req.guildId),
    client: req.client,
    product
  });
});

// Produkt bearbeiten (Formular absenden)
router.post("/guild/:guildId/product/:productId/edit", requireAuth, requireGuildAccess, upload.single('imageFile'), async (req, res) => {
  const { name, description, price, roleId } = req.body;
  const product = await Product.findOne({
    _id: req.params.productId,
    clientId: req.client._id,
    guildId: req.guildId
  });
  if (!product) return res.status(404).send("Produkt nicht gefunden");

  product.name = name;
  product.description = description;
  product.price = Number.parseFloat(price);
  product.roleId = roleId || null;
  if (req.file) {
    product.imageUrl = `/uploads/${req.file.filename}`;
  }
  await product.save();

  // AJAX/JSON-Request?
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    return res.json({ success: true, product });
  }
  res.redirect(`/dashboard/guild/${req.guildId}`);
});

// Ressourcen & Voreinstellungen anzeigen (alle Ressourcen für alle Produkte der Guild)
router.get("/guild/:guildId/rss", requireAuth, requireGuildAccess, async (req, res) => {
  const products = await Product.find({ clientId: req.client._id, guildId: req.guildId });
  const productIds = products.map(p => p._id);
  const resources = await Resource.find({ productId: { $in: productIds } }).populate('productId');
  res.render("dashboard/rss", {
    user: req.session.user,
    guild: req.session.user.guilds.find((g) => g.id === req.guildId),
    client: req.client,
    products,
    resources
  });
});

// Approve-Route für PayPal-Bestellungen
router.post('/guild/:guildId/order/:orderId/approve', requireAuth, requireGuildAccess, async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).send('Order not found');
  if (order.paymentMethod !== 'paypal' || order.status !== 'paypal_pending') return res.status(400).send('Order is not pending PayPal');
  order.status = 'paid';
  order.paid = true;
  await order.save();
  res.redirect(`/dashboard/guild/${req.params.guildId}`);
});

// Wallet configuration route
router.post('/guild/:guildId/config/wallet', requireAuth, requireGuildAccess, async (req, res) => {
    try {
        const { btcAddress, ethAddress, solAddress, ltcAddress } = req.body;
        // Finde die passende GuildConfig
        let guildConfig = req.client.guildConfigs.find(config => config.guildId === req.guildId);
        if (!guildConfig) {
            guildConfig = { guildId: req.guildId };
            req.client.guildConfigs.push(guildConfig);
        }
        guildConfig.btcAddress = btcAddress;
        guildConfig.ethAddress = ethAddress;
        guildConfig.solAddress = solAddress;
        guildConfig.ltcAddress = ltcAddress;
        await req.client.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating wallet addresses:', error);
        res.status(500).json({ error: 'Interner Server Fehler' });
    }
});

// Admin Wallet Page
router.get('/guild/:guildId/wallet', requireAuth, requireGuildAccess, async (req, res) => {
    // Hole die passende GuildConfig
    const guildConfig = req.client.guildConfigs.find(config => config.guildId === req.guildId) || {};
    // Dummy balances for now (replace with real API calls if needed)
    const balances = {
        bitcoin: 0,
        ethereum: 0,
        solana: 0,
        litecoin: 0
    };
    res.render('dashboard/wallet', {
        user: req.session.user,
        guild: req.session.user.guilds.find((g) => g.id === req.guildId),
        client: req.client,
        config: guildConfig,
        balances
    });
});

// AJAX-Check: Ist der Shop-Slug schon vergeben?
router.post('/dashboard/check-shop-slug', requireAuth, async (req, res) => {
  const { shopSlug, guildId } = req.body;
  if (!shopSlug) return res.json({ taken: false });
  const client = await Client.findOne({
    $or: [
      { shopSlug: shopSlug },
      { 'guildConfigs.shopSlug': shopSlug }
    ]
  });
  if (!client) return res.json({ taken: false });
  // Prüfe, ob der Slug in einer anderen GuildConfig liegt
  const usedInOtherGuild = client.guildConfigs && client.guildConfigs.some(cfg => cfg.shopSlug === shopSlug && cfg.guildId !== guildId);
  const isRoot = client.shopSlug === shopSlug && (!client.guildConfigs || !client.guildConfigs.some(cfg => cfg.shopSlug === shopSlug && cfg.guildId === guildId));
  if (usedInOtherGuild || isRoot) {
    return res.json({ taken: true });
  }
  res.json({ taken: false });
});

// Coupons Übersicht
router.get('/guild/:guildId/coupons', requireAuth, requireGuildAccess, async (req, res) => {
  const coupons = await Coupon.find();
  res.render('dashboard/coupons', { coupons, guild: req.guildId });
});

// Coupon anlegen
router.post('/guild/:guildId/coupon', requireAuth, requireGuildAccess, async (req, res) => {
  await Coupon.create(req.body);
  res.redirect(`/dashboard/guild/${req.guildId}/coupons`);
});

// Coupon löschen
router.post('/guild/:guildId/coupon/:couponId/delete', requireAuth, requireGuildAccess, async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.couponId);
  res.redirect(`/dashboard/guild/${req.guildId}/coupons`);
});

module.exports = router
