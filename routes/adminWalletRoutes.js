const express = require('express');
const router = express.Router();
const adminWalletController = require('../controllers/adminWalletController');
const { authenticateUser, isAdmin } = require('../middleware/auth');

// Public routes (für User)
router.post('/crypto/initiate', authenticateUser, adminWalletController.initiateCryptoPayment);
router.post('/crypto/confirm', authenticateUser, adminWalletController.confirmPaymentSent);

// Admin routes
router.get('/admin/wallet/addresses', authenticateUser, isAdmin, adminWalletController.getWalletAddresses);
router.get('/admin/payments/pending', authenticateUser, isAdmin, adminWalletController.getPendingPayments);
router.post('/admin/payment/confirm', authenticateUser, isAdmin, adminWalletController.adminConfirmPayment);

module.exports = router; 