const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const adminWalletSchema = new Schema({
    addresses: {
        bitcoin: String,
        ethereum: String,
        solana: String,
        litecoin: String
    },
    pendingPayments: [{
        orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
        userId: String,
        amount: Number,
        currency: { type: String, enum: ['bitcoin', 'ethereum', 'solana', 'litecoin'] },
        expectedAmount: Number, // Betrag in der gewählten Kryptowährung
        status: { type: String, enum: ['pending', 'confirmed', 'expired'], default: 'pending' },
        txHash: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date
    }]
});

module.exports = mongoose.model('AdminWallet', adminWalletSchema); 