const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: String, required: true },
  sterne: { type: Number, min: 1, max: 5, required: true },
  kommentar: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', FeedbackSchema); 