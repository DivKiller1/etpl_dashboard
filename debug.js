const { User, Attendance, Leave } = require('./api/_lib/models');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/etpl");
    
    // just fetch one week data
    const activeEmployees = await User.find({ isDeleted: false, isSuspended: false }).select('_id fullName lastName');
    const trendMatch = { checkInTime: { $exists: true, $nin: [null, false, "", 0] } };
    const attendances = await Attendance.find(trendMatch).select('userId date').limit(100);
    
    const weeklyData = {};
    attendances.forEach(a => {
        if (!a.date) return;
        const date = new Date(a.date);
        const week = `W_Test`;
        const uId = a.userId?.$oid || a.userId?.toString();
        
        if (!weeklyData[week]) {
            weeklyData[week] = { presentDays: {}, leaveDays: {} };
        }
        if (!weeklyData[week].presentDays[uId]) weeklyData[week].presentDays[uId] = new Set();
        weeklyData[week].presentDays[uId].add(date.getDay());
    });
    
    const w = weeklyData['W_Test'] || { presentDays: {} };
    
    const emp = activeEmployees[0];
    const id = emp._id.toString();
    console.log("Employee ID:", id);
    console.log("pDays for this emp:", w.presentDays[id]);
    process.exit(0);
}
run();
