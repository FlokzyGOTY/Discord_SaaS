const mongoose = require("mongoose")
const crypto = require("crypto")

// Schema für die Konfiguration eines einzelnen Servers
const guildConfigSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    shopSlug: {
      type: String,
      sparse: true,
    },
    paypalLink: String,
    nowPaymentsKey: String,
    adminChannelId: String,
    shopName: String,
    ticketCategoryId: String,
    supportRoleId: String,
    btcAddress: { type: String, default: '' },
    ethAddress: { type: String, default: '' },
    solAddress: { type: String, default: '' },
    ltcAddress: { type: String, default: '' }
  },
  { _id: false }
)

const clientSchema = new mongoose.Schema(
  {
    discordId: {
      type: String,
      required: true,
      unique: true,
    },
    guildIds: [
      {
        type: String,
      },
    ],
    // Für Abwärtskompatibilität behalten wir die alten Felder bei
    config: {
      paypalLink: String,
      nowPaymentsKey: String,
      adminChannelId: String,
      shopName: String,
      ticketCategoryId: String,
      supportRoleId: String,
    },
    shopSlug: {
      type: String,
      sparse: true,
    },
    // Neue Struktur: Ein Array von Guild-Konfigurationen
    guildConfigs: [guildConfigSchema],
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("Client", clientSchema)
