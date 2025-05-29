const mongoose = require("mongoose")

const orderSchema = new mongoose.Schema(
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
    userId: {
      type: String,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paypal_pending", "paid", "completed", "cancelled"],
      default: "pending",
    },
    paid: {
      type: Boolean,
      default: false,
    },
    paymentMethod: {
      type: String,
      enum: ["crypto", "paypal", "stripe"],
    },
    paymentId: String,
    amount: Number,
    isExpress: {
      type: Boolean,
      default: false,
    },
    discountCode: { type: String },
    discountAmount: { type: Number },
    quantity: { type: Number, default: 1 },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("Order", orderSchema)
