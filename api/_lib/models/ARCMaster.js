const mongoose = require('mongoose');

const arcMasterSchema = new mongoose.Schema({
    customerId: { type: String, required: true },
    componentType: { type: String, enum: ['civil', 'electric', 'labour'], required: true },
    equipmentName: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    uom: { type: String, required: true },
    make: { type: String, required: true },
    basePrice: { type: Number, required: true },
    prices: {
        east: Number,
        west: Number,
        north: Number,
        south: Number
    },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

// Validation for date range
arcMasterSchema.pre('save', function(next) {
    if (this.validTo <= this.validFrom) {
        return next(new Error('Valid To date must be after Valid From date'));
    }
    next();
});

module.exports = mongoose.model('ARCMaster', arcMasterSchema);
