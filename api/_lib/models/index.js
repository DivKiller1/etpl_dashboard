const mongoose = require('mongoose');

// User Model
const UserSchema = new mongoose.Schema({
    name: String,
    fullName: String,
    lastName: String,
    isDeleted: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false }
}, { collection: 'users', strict: false });

// Customer Model
const CustomerSchema = new mongoose.Schema({
    name: String
}, { collection: 'customers' });

// Site Model
const SiteSchema = new mongoose.Schema({
    name: String,
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }
}, { collection: 'sites', strict: false });

// Attendance Model
const AttendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: String,
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' }
}, { collection: 'attendances' });

// Expense Model
const ExpenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    amount: Number,
    date: String,
    status: String
}, { collection: 'expenses' });

// Leave Model
const LeaveSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startDate: String,
    endDate: String,
    status: String,
    type: String,
    amount: Number
}, { collection: 'leaves', strict: false });

// PaymentManagement Model
// siteId is stored as STRING (not ObjectId) — use $toString when joining with sites
const PaymentManagementSchema = new mongoose.Schema({
    siteId: String,
    customerId: mongoose.Schema.Types.ObjectId,
    requestedAmount: Number,
    requestMode: String,   // "With PO" | "Without PO"
    status: String,        // "Pending" | "Approved" | "Completed" | "Rejected"
    isDeleted: Boolean,
    created: Date
}, { collection: 'paymentmanagements', strict: false });

module.exports = {
    User: mongoose.model('User', UserSchema),
    Customer: mongoose.model('Customer', CustomerSchema),
    Site: mongoose.model('Site', SiteSchema),
    Attendance: mongoose.model('Attendance', AttendanceSchema),
    Expense: mongoose.model('Expense', ExpenseSchema),
    Leave: mongoose.model('Leave', LeaveSchema),
    PaymentManagement: mongoose.model('PaymentManagement', PaymentManagementSchema)
};
