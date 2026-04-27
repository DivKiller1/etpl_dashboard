const mongoose = require('mongoose');

const contactPersonSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: String,
    phone: String,
    designation: String
});

const vendorSchema = new mongoose.Schema({
    vendorId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    vendorType: { type: String, enum: ['Other', 'Civil', 'Electric', 'Labor'], required: true },
    houseNo: String,
    street: String,
    state: String,
    district: String,
    country: { type: String, default: 'India' },
    pinCode: String,
    pan: { type: String, required: true },
    gst: { type: String, required: true },
    aadhar: { type: String, required: true },
    bankDetails: {
        accountHolder: { type: String, required: true },
        bankName: { type: String, required: true },
        ifsc: { type: String, required: true },
        accountNumber: { type: String, required: true }
    },
    contacts: [contactPersonSchema],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
