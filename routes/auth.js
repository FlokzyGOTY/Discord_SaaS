const express = require("express")
const axios = require("axios")
const router = express.Router()
const Client = require("../models/Client")
const User = require('../models/User')

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback"

router.get("/discord", (req, res) => {
  const redirect = req.query.redirect || "/";
  req.session.loginRedirect = redirect;
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
  })

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
})

router.get("/discord/callback", async (req, res) => {
  const { code } = req.query

  if (!code) {
    return res.redirect("/")
  }

  try {
    // Exchange code for token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token } = tokenResponse.data

    // Get user info
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    // Get user guilds
    const guildsResponse = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    const user = userResponse.data
    const guilds = guildsResponse.data.filter((guild) => (guild.permissions & 0x20) === 0x20) // MANAGE_GUILD permission

    // Logging
    console.log('Discord-Callback USER:', user);
    console.log('Session VOR Setzen:', req.session);

    // Update or create client
    let client = await Client.findOne({ discordId: user.id })
    if (!client) {
      client = new Client({
        discordId: user.id,
        guildIds: guilds.map((g) => g.id),
      })
    } else {
      client.guildIds = guilds.map((g) => g.id)
    }
    await client.save()

    // Save to session
    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      guilds: guilds,
    }
    req.session.userId = user.id;

    console.log('Session NACH Setzen:', req.session);

    // Nach Login auf ursprüngliche Shop-Seite weiterleiten, falls gesetzt
    const redirectUrl = req.session.loginRedirect || "/";
    delete req.session.loginRedirect;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth error:", error)
    res.redirect("/")
  }
})

router.get("/logout", (req, res) => {
  req.session.destroy()
  res.redirect("/")
})

// Registrierung
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  try {
    const user = new User({ email, password, name });
    await user.save();
    req.session.userId = user._id;
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'E-Mail bereits vergeben' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ error: 'Falsche E-Mail oder Passwort' });
  }
  req.session.userId = user._id;
  res.json({ success: true });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Session-Check
router.get('/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

module.exports = router
