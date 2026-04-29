const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema({
    siteId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    customerId: { type: String, required: true },
    state: String,
    district: String,
    location: String,
    status: { type: String, enum: ['Active', 'Inactive', 'Completed', 'On-Hold'], default: 'Active' }
}, { timestamps: true });

const boqMasterItemSchema = new mongoose.Schema({
    description: String,
    quantity: { type: Number, default: 1 },
    unitPrice: Number,
    uom: String,
    costHead: String, // e.g. Civil
    remark: String
});

const boqMasterSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    customerId: { type: String, required: true },
    siteId: { type: String, required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOQTemplate' },
    items: [boqMasterItemSchema],
    totalAmount: Number,
    status: { type: String, enum: ['Draft', 'Final'], default: 'Draft' }
}, { timestamps: true });

const holidaySchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: Date, required: true },
    remark: String
}, { timestamps: true });

const dashboardSummarySchema = new mongoose.Schema({
    timeframe: String,
    totalEmployees: Number,
    totalExpenses: Number,
    pendingLeaves: Number,
    pendingExpenses: Number,
    totalCustomers: Number,
    totalVendors: Number,
    totalSites: Number
}, { timestamps: true });

module.exports = {
    Site: mongoose.model('Site', siteSchema),
    BOQ: mongoose.model('BOQ', boqMasterSchema),
    Holiday: mongoose.model('Holiday', holidaySchema),
    DashboardSummary: mongoose.model('DashboardSummary', dashboardSummarySchema)
};
