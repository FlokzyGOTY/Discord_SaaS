const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shopSchema = new Schema({
    // ... existing code ...
    config: {
        // ... existing code ...
        btcAddress: { type: String, default: '' },
        ethAddress: { type: String, default: '' },
        solAddress: { type: String, default: '' },
        ltcAddress: { type: String, default: '' }
    }
    // ... existing code ...
});

module.exports = mongoose.model('Shop', shopSchema); 