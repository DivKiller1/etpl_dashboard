const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    expenseId: { type: String, required: true, unique: true },
    employeeId: { type: String, required: true }, // Submitting employee
    date: { type: Date, required: true },
    category: { 
        type: String, 
        enum: ['Travel', 'Meals', 'Accommodation', 'Supplies', 'Other'],
        required: true 
    },
    actualAmount: { type: Number, required: true },
    approvedAmount: { type: Number },
    description: { type: String, required: true },
    receiptPhoto: String, // Path to photo
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected', 'Paid'], 
        default: 'Pending' 
    },
    adminRemark: String,
    accountantId: { type: String }, // Assigned accountant employeeId
    timeframe: String // YYYY-MM
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
