const Client = require("../models/Client")

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/auth/discord")
  }
  next()
}

const requireGuildAccess = async (req, res, next) => {
  const guildId = req.params.guildId || req.body.guildId
  if (!guildId) {
    return res.status(400).json({ error: "Guild ID required" })
  }

  try {
    const client = await Client.findOne({
      discordId: req.session.user.id,
      guildIds: guildId,
    })

    if (!client) {
      return res.status(403).json({ error: "Access denied" })
    }

    req.client = client
    req.guildId = guildId
    next()
  } catch (error) {
    res.status(500).json({ error: "Server error" })
  }
}

module.exports = { requireAuth, requireGuildAccess }
