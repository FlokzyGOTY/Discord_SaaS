const mongoose = require("mongoose")

const productSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    roleId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("Product", productSchema)
