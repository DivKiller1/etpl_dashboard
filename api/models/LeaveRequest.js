const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    employeeId: String,
    type: String,
    startDate: Date,
    endDate: Date,
    reason: String,
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    remark: String,
    timeframe: String
}, { timestamps: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
