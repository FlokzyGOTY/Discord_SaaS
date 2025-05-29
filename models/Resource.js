const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['key', 'account', 'file'], required: true },
  value: { type: String },      // Key, Account (user:pass), Dateiname
  fileUrl: { type: String },    // Für Files (Pfad oder URL)
  used: { type: Boolean, default: false },
  meta: { type: Object },       // Optional: Zusatzinfos
  assignedToOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Nach Zuweisung
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Resource', ResourceSchema); 