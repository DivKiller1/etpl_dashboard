const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    level: { type: Number, default: 1 }
}, { timestamps: true });

const leaveTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    code: String,
    description: String,
    maxDaysPerYear: Number
}, { timestamps: true });

module.exports = {
    Role: mongoose.model('Role', roleSchema),
    LeaveType: mongoose.model('LeaveType', leaveTypeSchema)
};
