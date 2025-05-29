const express = require("express")
const router = express.Router()
const Client = require("../models/Client")
const Product = require("../models/Product")
const Order = require("../models/Order")
const axios = require("axios")
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Resource = require('../models/Resource');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

router.get("/:slug", async (req, res) => {
  console.log("[SHOP] Slug:", req.params.slug);
  const client = await Client.findOne({
    $or: [
      { shopSlug: req.params.slug },
      { "guildConfigs.shopSlug": req.params.slug }
    ]
  })
  console.log("[SHOP] Client:", client ? client._id : null, client ? client.shopSlug : null);
  if (!client) {
    console.log("[SHOP] Kein Client gefunden!");
    return res.status(404).render("404")
  }
  let guildId = null;
  let guildConfig = null;
  const matchingGuildConfig = client.guildConfigs.find(config => config.shopSlug === req.params.slug);
  if (matchingGuildConfig) {
    guildId = matchingGuildConfig.guildId;
    guildConfig = matchingGuildConfig;
  } else {
    guildId = client.guildIds[0];
    guildConfig = client.config;
  }
  console.log("[SHOP] GuildId:", guildId);
  console.log("[SHOP] GuildConfig:", guildConfig);
  const products = await Product.find({
    clientId: client._id,
    guildId: guildId,
    active: true,
  })
  console.log("[SHOP] Gefundene Produkte:", products.map(p => ({_id: p._id, name: p.name, guildId: p.guildId, clientId: p.clientId, active: p.active })));
  const productsWithStock = await Promise.all(products.map(async (product) => {
    const stock = await Resource.countDocuments({ productId: product._id, used: false });
    return { ...product.toObject(), stock };
  }));
  const clientWithConfig = {
    ...client.toObject(),
    config: guildConfig,
    shopSlug: req.params.slug,
    currentGuildId: guildId
  };
  res.render("shop/index", {
    client: clientWithConfig,
    products: productsWithStock,
    shopName: guildConfig.shopName || "Shop",
  })
})

router.get("/:slug/product/:productId", async (req, res) => {
  // Suche nach einem Client mit diesem Shop-Slug (entweder im Legacy-Feld oder in guildConfigs)
  const client = await Client.findOne({
    $or: [
      { shopSlug: req.params.slug },
      { "guildConfigs.shopSlug": req.params.slug }
    ]
  })

  if (!client) {
    return res.status(404).render("404")
  }

  // Bestimme, welche Guild-Konfiguration verwendet werden soll
  let guildConfig = null;
  
  // Prüfe, ob der Slug zu einer Guild-Konfiguration gehört
  const matchingGuildConfig = client.guildConfigs.find(config => config.shopSlug === req.params.slug);
  
  if (matchingGuildConfig) {
    // Wenn ja, verwende diese Guild-Konfiguration
    guildConfig = matchingGuildConfig;
  } else {
    // Wenn nicht, verwende die Legacy-Konfiguration
    guildConfig = client.config;
  }

  const product = await Product.findOne({
    _id: req.params.productId,
    clientId: client._id,
    active: true,
  })

  if (!product) {
    return res.status(404).render("404")
  }

  // Stock zählen
  const stock = await Resource.countDocuments({ productId: product._id, used: false });

  // Erstelle ein Client-Objekt mit der richtigen Konfiguration
  const clientWithConfig = {
    ...client.toObject(),
    config: guildConfig,
    shopSlug: req.params.slug
  };

  res.render("shop/product", {
    client: clientWithConfig,
    product,
    stock,
    shopName: guildConfig.shopName || "Shop",
  })
})

router.post("/:slug/order", async (req, res) => {
  console.log('--- PAYPAL CHECKOUT DEBUG ---');
  console.log('Session:', req.session);
  console.log('Body:', req.body);
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ error: "Bitte zuerst einloggen!" });
  }
  const { productId, paymentMethod, isExpress } = req.body;

  // Suche nach einem Client mit diesem Shop-Slug (entweder im Legacy-Feld oder in guildConfigs)
  const client = await Client.findOne({
    $or: [
      { shopSlug: req.params.slug },
      { "guildConfigs.shopSlug": req.params.slug }
    ]
  })
  console.log('Client:', client ? client._id : null, client ? client.shopSlug : null);
  let guildConfig = null;
  const matchingGuildConfig = client && client.guildConfigs.find(config => config.shopSlug === req.params.slug);
  if (matchingGuildConfig) {
    guildConfig = matchingGuildConfig;
  } else if (client) {
    guildConfig = client.config;
  }
  console.log('GuildConfig:', guildConfig);
  
  if (!client) {
    return res.status(404).json({ error: "Shop not found" })
  }

  // Bestimme, welche Guild-Konfiguration verwendet werden soll
  let guildId = null;
  
  if (matchingGuildConfig) {
    // Wenn ja, verwende diese Guild-Konfiguration
    guildId = matchingGuildConfig.guildId;
  } else {
    // Wenn nicht, verwende die erste Guild-ID und die Legacy-Konfiguration
    guildId = client.guildIds[0];
  }

  const product = await Product.findOne({
    _id: productId,
    clientId: client._id,
    active: true,
  })

  if (!product) {
    return res.status(404).json({ error: "Product not found" })
  }

  const amount = isExpress && product.expressPrice ? product.expressPrice : product.price

  const order = new Order({
    clientId: client._id,
    guildId: guildId, // Verwende die richtige Guild-ID
    userId: req.session.user.id,
    productId: product._id,
    paymentMethod,
    amount,
    isExpress: isExpress || false,
    status: paymentMethod === 'paypal' ? 'paypal_pending' : undefined,
  })

  await order.save()

  // Logging: Anzahl und IDs freie Ressourcen vor Zuweisung
  const freeResourcesDocs = await Resource.find({ productId: product._id, used: false });
  const freeResources = freeResourcesDocs.length;
  console.log(`[ORDER] Neue Bestellung: orderId=${order._id}, productId=${product._id}, freie Ressourcen: ${freeResources}, IDs: [${freeResourcesDocs.map(r => r._id).join(', ')}]`);

  // Versuche sofort eine Ressource zuzuweisen (wenn noch frei)
  let resource = await Resource.findOneAndUpdate(
    { productId: product._id, used: false },
    { used: true, assignedToOrder: order._id },
    { new: true }
  );
  if (!resource) {
    // Retry: Hole nochmal die freien Ressourcen und versuche erneut
    const retryFree = await Resource.find({ productId: product._id, used: false });
    console.warn(`[ORDER] Erster Zuweisungsversuch fehlgeschlagen. Retry. Noch frei: ${retryFree.length}, IDs: [${retryFree.map(r => r._id).join(', ')}]`);
    resource = await Resource.findOneAndUpdate(
      { productId: product._id, used: false },
      { used: true, assignedToOrder: order._id },
      { new: true }
    );
  }
  if (resource) {
    console.log(`[ORDER] Ressource zugewiesen: resourceId=${resource._id}, orderId=${order._id}`);
  } else {
    console.warn(`[ORDER] Keine Ressource zugewiesen! orderId=${order._id}, productId=${product._id}, freie Ressourcen: ${freeResources}`);
  }

  // Generate payment info based on method
  let paymentInfo = {}

  if (paymentMethod === "paypal" && guildConfig.paypalLink) {
    paymentInfo = {
      type: "paypal",
      url: `https://www.paypal.com/paypalme/${encodeURIComponent(guildConfig.paypalLink)}`,
      instructions: `Bitte sende $${amount} an unsere PayPal-E-Mail <b>${guildConfig.paypalLink}</b> und gib als Verwendungszweck die Bestellnummer <b>${order._id}</b> an.`,
    }
  } else if (paymentMethod === "crypto") {
    // Direct wallet payment (no NowPayments)
    const { cryptoCoin } = req.body;
    let address = '';
    if (cryptoCoin === 'bitcoin') address = guildConfig.btcAddress;
    if (cryptoCoin === 'ethereum') address = guildConfig.ethAddress;
    if (cryptoCoin === 'solana') address = guildConfig.solAddress;
    if (cryptoCoin === 'litecoin') address = guildConfig.ltcAddress;
    if (!address) {
      return res.status(400).json({ error: 'Keine Wallet-Adresse für diese Coin hinterlegt.' });
    }
    // Get price from CoinGecko
    const ids = { bitcoin: 'bitcoin', ethereum: 'ethereum', solana: 'solana', litecoin: 'litecoin' };
    try {
      const cgRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids[cryptoCoin]}&vs_currencies=eur`);
      const priceEur = cgRes.data[ids[cryptoCoin]].eur;
      const amountCoin = (amount / priceEur).toFixed(8);
      // QR Code URL (optional, simple)
      const qrData = `${cryptoCoin}:${address}?amount=${amountCoin}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
      paymentInfo = {
        type: "crypto",
        coin: cryptoCoin,
        address,
        amountCoin,
        amountEur: amount,
        qrCodeUrl,
        instructions: `Sende <b>${amountCoin} ${cryptoCoin.toUpperCase()}</b> an die folgende Adresse:`
      };
    } catch (e) {
      return res.status(500).json({ error: 'Krypto-Preis konnte nicht geladen werden.' });
    }
  }

  res.json({
    orderId: order._id,
    paymentInfo,
    resource,
  })
})

// Success-Page für Stripe und andere Zahlungen
router.get('/:slug/success', async (req, res) => {
  let session = null;
  const session_id = req.query.session_id;
  let order = null;
  let resource = null;
  let product = null;
  let client = null;
  let customerEmail = null;

  if (session_id) {
    // Stripe Success
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['line_items', 'customer'] });
      customerEmail = session.customer_details?.email || session.customer?.email || null;
      console.log(`[STRIPE SUCCESS] session_id=${session_id}`);
      // Suche Produkt anhand des Namens im Warenkorb (vereinfachte Demo-Logik)
      const line = session.line_items?.data[0];
      console.log(`[STRIPE SUCCESS] Produktbeschreibung:`, line?.description);
      product = await Product.findOne({ name: line?.description });
      if (product) {
        console.log(`[STRIPE SUCCESS] Produkt gefunden: productId=${product._id}`);
        // NUR noch Discord-ID aus Stripe-Session-Metadata verwenden!
        let discordUserId = null;
        if (session.metadata && session.metadata.discordUserId) {
          discordUserId = session.metadata.discordUserId;
        }
        if (!discordUserId) {
          // Fehler: Keine User-ID verfügbar
          return res.status(400).render('shop/success', {
            order: null,
            resource: null,
            product,
            client,
            shopName: client?.config?.shopName || 'Shop',
            session: session || null,
            error: "Deine Bestellung konnte nicht zugeordnet werden. Bitte logge dich erneut ein."
          });
        }
        order = await Order.create({
          clientId: product.clientId,
          productId: product._id,
          guildId: product.guildId,
          paymentMethod: 'stripe',
          amount: session.amount_total / 100,
          userId: discordUserId, // <-- Nur Discord-ID!
          quantity: line?.quantity || 1,
          discountCode: session.discounts?.[0]?.coupon?.id || undefined,
          discountAmount: session.total_details?.amount_discount ? session.total_details.amount_discount / 100 : undefined,
        });
        // Logging: Anzahl und IDs freie Ressourcen vor Zuweisung
        const freeResourcesDocs = await Resource.find({ productId: product._id, used: false });
        const freeResources = freeResourcesDocs.length;
        console.log(`[STRIPE SUCCESS] Freie Ressourcen vor Zuweisung: ${freeResources}, IDs: [${freeResourcesDocs.map(r => r._id).join(', ')}]`);
        // Ressource zuweisen
        resource = await Resource.findOneAndUpdate(
          { productId: product._id, used: false },
          { used: true, assignedToOrder: order._id },
          { new: true }
        );
        if (!resource) {
          // Retry: Hole nochmal die freien Ressourcen und versuche erneut
          const retryFree = await Resource.find({ productId: product._id, used: false });
          console.warn(`[STRIPE SUCCESS] Erster Zuweisungsversuch fehlgeschlagen. Retry. Noch frei: ${retryFree.length}, IDs: [${retryFree.map(r => r._id).join(', ')}]`);
          resource = await Resource.findOneAndUpdate(
            { productId: product._id, used: false },
            { used: true, assignedToOrder: order._id },
            { new: true }
          );
        }
        if (resource) {
          console.log(`[STRIPE SUCCESS] Ressource zugewiesen: resourceId=${resource._id}, orderId=${order._id}`);
        } else {
          console.warn(`[STRIPE SUCCESS] Keine Ressource zugewiesen! orderId=${order._id}, productId=${product._id}, freie Ressourcen: ${freeResources}`);
        }
      } else {
        console.warn(`[STRIPE SUCCESS] Produkt nicht gefunden für Beschreibung:`, line?.description);
      }
      client = await Client.findById(product?.clientId);
      if (client) client.shopSlug = req.params.slug;

      // Nach erfolgreichem Kauf: Rechnung per E-Mail senden
      if (customerEmail && order && product) {
        const html = `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 32px #6366f11a;padding:0 0 2.2rem 0;overflow:hidden;">
            <div style="background:linear-gradient(90deg,#6366f1,#60a5fa 90%);padding:2.2rem 1.5rem 1.2rem 1.5rem;text-align:center;">
              <div style="font-size:2.5rem;margin-bottom:0.7rem;"><span>🧾</span></div>
              <div style="font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:0.3rem;">Vielen Dank für deinen Kauf!</div>
              <div style="color:#e0fce7;font-size:1.08rem;">Deine Zahlung war erfolgreich.</div>
            </div>
            <div style="padding:2.2rem 1.5rem 0.5rem 1.5rem;">
              <div style="font-size:1.18rem;font-weight:700;color:#6366f1;margin-bottom:0.7rem;text-align:center;"><span style='font-size:1.2em;'>📦</span> ${product.name}</div>
              <table style="width:100%;font-size:1.08rem;margin-bottom:1.2rem;border-collapse:separate;border-spacing:0 0.3rem;">
                <tr><td style="color:#888;">Bestellnummer:</td><td style="text-align:right;"><b>${order._id}</b></td></tr>
                <tr><td style="color:#888;">Preis:</td><td style="text-align:right;">€${order.amount.toFixed(2)}</td></tr>
                <tr><td style="color:#888;">Transaktion:</td><td style="text-align:right;">${session.id}</td></tr>
              </table>
              <a href="${process.env.BASE_URL}/shop/${client?.shopSlug}" style="display:block;margin:1.7rem auto 0.7rem auto;padding:0.8rem 2.2rem;background:linear-gradient(90deg,#6366f1,#60a5fa 90%);color:#fff;font-weight:700;border-radius:8px;text-decoration:none;font-size:1.08rem;max-width:220px;text-align:center;">Zum Shop</a>
              <div style="margin-top:2.2rem;color:#888;font-size:0.97rem;text-align:center;">Bei Fragen wende dich bitte an den Shop-Support.<br><br><span style='font-size:0.95em;'>${client?.config?.shopName || 'Shop'}<br>${process.env.BASE_URL}/shop/${client?.shopSlug}</span></div>
            </div>
          </div>
        `;
        try {
          await sgMail.send({
            to: customerEmail,
            from: process.env.FROM_EMAIL,
            subject: `Deine Rechnung für ${product.name}`,
            html
          });
          console.log(`[SENDGRID] Rechnung gesendet an ${customerEmail}`);
        } catch (e) {
          console.error('[SENDGRID] Fehler beim Senden der Rechnung:', e);
        }
      }
    } catch (e) {
      console.error(`[STRIPE SUCCESS] Fehler:`, e);
    }
  }
  // TODO: Auch für PayPal/Krypto-Flow Order und Resource zuweisen
  res.render('shop/success', {
    order,
    resource,
    product,
    client,
    shopName: client?.config?.shopName || 'Shop',
    session: session || null,
  });
});

// Liefert alle Bestellungen des eingeloggten Users für diesen Shop
router.get('/:slug/user-orders', async (req, res) => {
  const discordUserId = req.session.userId || (req.session.user && req.session.user.id);
  if (!discordUserId) return res.status(401).json({ error: 'Nicht eingeloggt' });

  // Debug-Logging
  console.log('[USER-ORDERS] Suche nach Orders für Discord-User-ID:', discordUserId);
  const orders = await Order.find({ userId: discordUserId }).populate('productId');
  console.log('[USER-ORDERS] Gefundene Orders:', orders.map(o => ({
    _id: o._id,
    userId: o.userId,
    productId: o.productId?._id || o.productId,
    assignedToOrder: o.assignedToOrder
  })));
  res.json(orders);
});

// Feedback-Übersicht für den Shop
router.get('/:slug/feedback', async (req, res) => {
  const client = await Client.findOne({
    $or: [
      { shopSlug: req.params.slug },
      { "guildConfigs.shopSlug": req.params.slug }
    ]
  });
  if (!client) return res.status(404).render('404');
  // Finde alle Orders für diesen Client
  const orders = await Order.find({ clientId: client._id });
  const orderIds = orders.map(o => o._id);
  // Lade alle Feedbacks zu diesen Orders
  const feedbacks = await require('../models/Feedback').find({ orderId: { $in: orderIds } }).populate({ path: 'orderId', populate: { path: 'productId' } }).sort({ createdAt: -1 });
  res.render('shop/feedback', {
    client,
    feedbacks,
    shopName: client.config?.shopName || 'Shop',
  });
});

// Neue Route: User meldet, dass er Geld via PayPal gesendet hat
router.post('/:slug/order/:orderId/paypal-sent', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentMethod !== 'paypal') return res.status(400).json({ error: 'Not a PayPal order' });
    if (order.status === 'paypal_pending') return res.json({ success: true }); // Bereits gemeldet
    order.status = 'paypal_pending';
    await order.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router
