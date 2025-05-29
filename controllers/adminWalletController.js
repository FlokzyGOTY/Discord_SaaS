const AdminWallet = require('../models/AdminWallet');
const Order = require('../models/Order');
const QRCode = require('qrcode');
const axios = require('axios');

const adminWalletController = {
    // Admin Wallet Adressen abrufen
    async getWalletAddresses(req, res) {
        try {
            const wallet = await AdminWallet.findOne();
            if (!wallet) {
                return res.status(404).json({ error: 'Admin Wallet nicht konfiguriert' });
            }
            res.json(wallet.addresses);
        } catch (error) {
            res.status(500).json({ error: 'Fehler beim Abrufen der Wallet-Adressen' });
        }
    },

    // Neue Krypto-Zahlung initiieren
    async initiateCryptoPayment(req, res) {
        try {
            const { orderId, currency } = req.body;
            const wallet = await AdminWallet.findOne();
            
            if (!wallet) {
                return res.status(404).json({ error: 'Admin Wallet nicht konfiguriert' });
            }

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Bestellung nicht gefunden' });
            }

            // Hole aktuellen Krypto-Preis von einer API
            const cryptoPrice = await getCryptoPrice(currency);
            const expectedAmount = order.amount / cryptoPrice; // Umrechnung EUR zu Crypto

            // Erstelle neue pending Payment
            const payment = {
                orderId: order._id,
                userId: req.user.id,
                amount: order.amount,
                currency,
                expectedAmount,
                expiresAt: new Date(Date.now() + 30 * 60000) // 30 Minuten gültig
            };

            wallet.pendingPayments.push(payment);
            await wallet.save();

            // Generiere QR-Code für die Zahlung
            const qrData = await QRCode.toDataURL(wallet.addresses[currency]);

            res.json({
                address: wallet.addresses[currency],
                expectedAmount,
                qrCode: qrData,
                expiresAt: payment.expiresAt
            });
        } catch (error) {
            console.error('Payment initiation error:', error);
            res.status(500).json({ error: 'Fehler beim Initiieren der Zahlung' });
        }
    },

    // Zahlungsbestätigung vom User
    async confirmPaymentSent(req, res) {
        try {
            const { orderId, txHash } = req.body;
            const wallet = await AdminWallet.findOne();
            
            const payment = wallet.pendingPayments.find(
                p => p.orderId.toString() === orderId && p.status === 'pending'
            );

            if (!payment) {
                return res.status(404).json({ error: 'Zahlung nicht gefunden' });
            }

            if (new Date() > payment.expiresAt) {
                payment.status = 'expired';
                await wallet.save();
                return res.status(400).json({ error: 'Zahlungszeitraum abgelaufen' });
            }

            // Update payment status
            payment.txHash = txHash;
            payment.status = 'pending';
            await wallet.save();

            // Update order status
            await Order.findByIdAndUpdate(orderId, { 
                status: 'crypto_pending',
                paymentInfo: {
                    currency: payment.currency,
                    txHash,
                    expectedAmount: payment.expectedAmount
                }
            });

            res.json({ success: true, message: 'Zahlung wird überprüft' });
        } catch (error) {
            res.status(500).json({ error: 'Fehler bei der Zahlungsbestätigung' });
        }
    },

    // Admin: Alle pending payments anzeigen
    async getPendingPayments(req, res) {
        try {
            const wallet = await AdminWallet.findOne()
                .populate('pendingPayments.orderId');
            
            const pendingPayments = wallet.pendingPayments
                .filter(p => p.status === 'pending')
                .map(p => ({
                    orderId: p.orderId._id,
                    orderDetails: p.orderId,
                    amount: p.amount,
                    currency: p.currency,
                    expectedAmount: p.expectedAmount,
                    txHash: p.txHash,
                    createdAt: p.createdAt
                }));

            res.json(pendingPayments);
        } catch (error) {
            res.status(500).json({ error: 'Fehler beim Abrufen der ausstehenden Zahlungen' });
        }
    },

    // Admin: Zahlung bestätigen
    async adminConfirmPayment(req, res) {
        try {
            const { orderId } = req.body;
            const wallet = await AdminWallet.findOne();
            
            const payment = wallet.pendingPayments.find(
                p => p.orderId.toString() === orderId && p.status === 'pending'
            );

            if (!payment) {
                return res.status(404).json({ error: 'Zahlung nicht gefunden' });
            }

            // Update payment status
            payment.status = 'confirmed';
            await wallet.save();

            // Update order status
            await Order.findByIdAndUpdate(orderId, { status: 'paid' });

            res.json({ success: true, message: 'Zahlung bestätigt' });
        } catch (error) {
            res.status(500).json({ error: 'Fehler bei der Zahlungsbestätigung' });
        }
    }
};

// Hilfsfunktion: Hole aktuellen Krypto-Preis
async function getCryptoPrice(currency) {
    try {
        // Beispiel mit CoinGecko API
        const ids = {
            bitcoin: 'bitcoin',
            ethereum: 'ethereum',
            solana: 'solana',
            litecoin: 'litecoin'
        };
        
        const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids[currency]}&vs_currencies=eur`
        );
        
        return response.data[ids[currency]].eur;
    } catch (error) {
        console.error('Error fetching crypto price:', error);
        throw new Error('Could not fetch crypto price');
    }
}

module.exports = adminWalletController; 