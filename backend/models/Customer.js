const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    houseNo: { type: String, required: true },
    street: { type: String, required: true },
    state: { type: String, required: true },
    district: { type: String, required: true },
    country: { type: String, default: 'India' },
    pinCode: { type: String, required: true },
    pan: { type: String, required: true },
    gst: { 
        type: String, 
        required: true,
        match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number']
    },
    aadhar: { type: String, required: true },
    bankDetails: {
        accountHolder: String,
        bankName: String,
        ifsc: String,
        accountNumber: String
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
