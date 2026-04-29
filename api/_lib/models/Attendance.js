const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employeeId: String,
    employeeName: String,
    date: Date,
    checkIn: String,
    checkOut: String,
    workingHours: Number,
    status: { type: String, enum: ['Present', 'Absent', 'Half-Day', 'On-Leave'], default: 'Present' },
    timeframe: String // e.g., "2026-01"
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
