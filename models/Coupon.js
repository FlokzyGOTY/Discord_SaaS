const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ["percent", "fixed"], required: true },
  value: { type: Number, required: true },
  minOrder: { type: Number, default: 0 },
  maxRedemptions: { type: Number, default: 0 }, // 0 = unbegrenzt
  redemptions: { type: Number, default: 0 },
  expiresAt: { type: Date },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema); 