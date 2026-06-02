const express = require('express');
const router = express.Router();
const { User, Site, Customer, Expense, Leave, Attendance } = require('../models');
const mongoose = require('mongoose');

const getCutoffDate = (duration) => {
    if (!duration || duration === 'all') return null;
    const days = parseInt(duration);
    if (isNaN(days)) return null;
    return new Date(new Date().setDate(new Date().getDate() - days));
};

const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getWeekRange = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
    const options = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString('en-US', options)} - ${sunday.toLocaleDateString('en-US', options)}`;
};

const getDateRangeFromWeek = (weekStr) => {
    if (!weekStr || weekStr === 'all') return null;
    const parts = weekStr.split('-');
    if (parts.length !== 2) return null;
    const week = parseInt(parts[0].replace('W', ''));
    const year = parseInt(parts[1]);
    if (isNaN(week) || isNaN(year)) return null;
    
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        
    const ISOweekEnd = new Date(ISOweekStart);
    ISOweekEnd.setDate(ISOweekStart.getDate() + 6);
    ISOweekEnd.setHours(23, 59, 59, 999);
    
    return { start: ISOweekStart, end: ISOweekEnd };
};

const formatDateStr = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const normalizeExpenseType = (type) => {
    if (!type) return 'Other';
    const t = type.trim().toLowerCase();
    if (t === 'ta') return 'TA';
    if (t === 'da') return 'DA';
    if (t.includes('hotel') || t === 'lodging') return 'Hotel';
    if (t.includes('office')) return 'Office Items';
    if (t.includes('material') || t.includes('procurement')) return 'Local Material Procurement';
    if (t.includes('labour') || t.includes('labor')) return 'Local Labour Payment';
    return 'Other';
};

router.get('/data', async (req, res) => {
    try {
        const { duration, expenseWeek, attendanceWeek } = req.query;
        const cutoff = getCutoffDate(duration);
        const cutoffStr = formatDateStr(cutoff);
        const expRange = getDateRangeFromWeek(expenseWeek);

        // 1. Get Active Employees with Names, exempting Directors
        const activeEmployees = await User.find({ 
            isDeleted: false, 
            isSuspended: false,
            roleId: { $not: { $regex: /director/i } },
            designation: { $not: { $regex: /director/i } }
        }).select('_id fullName lastName roleId designation');
        const activeCount = activeEmployees.length || 1;

        // 2. Aggregate Expenses
        const expenseMatch = { 
            customerId: { $type: "string", $regex: /^[0-9a-fA-F]{24}$/ },
            status: 'Paid'
        };
        
        if (expRange) {
            expenseMatch.date = { $gte: formatDateStr(expRange.start), $lte: formatDateStr(expRange.end) };
        } else if (cutoffStr) {
            expenseMatch.date = { $gte: cutoffStr };
        }

        const customerExpenses = await Expense.aggregate([
            { $match: expenseMatch },
            { $addFields: { custIdObj: { $toObjectId: '$customerId' } } },
            { $group: {
                _id: { customerId: '$custIdObj', siteId: '$siteId', type: { $ifNull: ['$type', 'Other'] } },
                total: { $sum: '$amount' }
            }},
            { $lookup: { from: 'customers', localField: '_id.customerId', foreignField: '_id', as: 'customer' } },
            { $unwind: '$customer' },
            { $group: {
                _id: { customerId: '$_id.customerId', siteId: '$_id.siteId' },
                name: { $first: '$customer.name' },
                siteTotal: { $sum: '$total' },
                types: { $push: { type: '$_id.type', total: '$total' } }
            }},
            { $addFields: {
                siteIdObj: {
                    $cond: {
                        if: { $regexMatch: { input: '$_id.siteId', regex: /^[0-9a-fA-F]{24}$/ } },
                        then: { $toObjectId: '$_id.siteId' },
                        else: null
                    }
                }
            }},
            { $lookup: { from: 'sites', localField: 'siteIdObj', foreignField: '_id', as: 'site' } },
            { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
            { $group: {
                _id: '$_id.customerId',
                name: { $first: '$name' },
                total: { $sum: '$siteTotal' },
                sites: { $push: {
                    siteId: '$_id.siteId',
                    name: { $ifNull: ['$site.name', 'Unknown Site'] },
                    total: '$siteTotal'
                }},
                allTypes: { $push: '$types' }
            }},
            { $project: {
                _id: 0, customerId: '$_id', name: 1, total: 1, sites: 1,
                types: {
                    $reduce: {
                        input: '$allTypes',
                        initialValue: [],
                        in: { $concatArrays: ['$$value', '$$this'] }
                    }
                }
            }}
        ]);

        const finalizedCustomerExpenses = customerExpenses.map(c => {
            const typeMap = {};
            c.types.forEach(t => {
                const normType = normalizeExpenseType(t.type);
                typeMap[normType] = (typeMap[normType] || 0) + t.total;
            });
            return {
                ...c,
                types: Object.keys(typeMap).map(k => ({ type: k, total: typeMap[k] }))
            };
        });

        // 3. Weekly Trends & Detailed Export
        const trendMatch = { checkInTime: { $exists: true, $nin: [null, false, "", 0] } };
        if (cutoffStr) trendMatch.date = { $gte: cutoffStr };

        const attendances = await Attendance.find(trendMatch).select('userId date siteId').lean();
        
        // Fetch all sites and customers to build mapping of siteId -> siteName and siteId -> customerName
        const sites = await Site.find({}).select('_id name customerId');
        const customers = await Customer.find({}).select('_id name');
        
        const customerMap = {};
        customers.forEach(c => {
            customerMap[c._id.toString()] = c.name;
        });
        
        const siteMap = {};
        const siteCustomerMap = {};
        sites.forEach(s => {
            const sId = s._id.toString();
            siteMap[sId] = s.name;
            const cId = s.customerId?.toString();
            siteCustomerMap[sId] = cId ? (customerMap[cId] || 'Unknown Customer') : 'Unknown Customer';
        });
        
        // Build map of active employees for name and role
        const userMap = {};
        const userRoleMap = {};
        activeEmployees.forEach(emp => {
            let empName = 'Unknown';
            if (emp.fullName) {
                empName = emp.fullName + (emp.lastName ? ' ' + emp.lastName : '');
            }
            userMap[emp._id.toString()] = empName;
            userRoleMap[emp._id.toString()] = emp.designation || emp.roleId || 'Staff';
        });
        
        // Flat daily attendance data for workforce location distribution
        const dailyAttendances = [];
        attendances.forEach(a => {
            const uId = a.userId?.toString();
            if (!uId || !userMap[uId]) return;
            const sId = a.siteId?.toString();
            const siteName = sId ? (siteMap[sId] || 'Unknown Site') : 'Office';
            const customerName = sId ? (siteCustomerMap[sId] || 'ETPL') : 'ETPL';
            dailyAttendances.push({
                employeeName: userMap[uId],
                role: userRoleMap[uId],
                date: formatDateStr(a.date),
                siteId: sId || 'office',
                siteName: siteName,
                customerName: customerName
            });
        });
        const leafMatch = { status: 'Approved' };
        if (cutoffStr) {
            leafMatch.$or = [
                { endDate: { $gte: cutoffStr } },
                { startDate: { $gte: cutoffStr } }
            ];
        }
        const leaves = await Leave.find(leafMatch).select('userId startDate endDate status type');

        const weeklyData = {};

        attendances.forEach(a => {
            if (!a.date) return;
            const date = new Date(a.date);
            const week = `W${getWeekNumber(date)}-${date.getFullYear()}`;
            const uId = a.userId?.$oid || a.userId?.toString();
            if (!uId) return;
            
            if (!weeklyData[week]) {
                weeklyData[week] = { presentDays: {}, leaveDays: {}, leaveTypes: {}, range: getWeekRange(date) };
            }
            if (!weeklyData[week].presentDays[uId]) weeklyData[week].presentDays[uId] = new Set();
            weeklyData[week].presentDays[uId].add(date.getDay());
        });

        leaves.forEach(l => {
            if (l.status !== 'Approved' || !l.startDate) return;
            const start = new Date(l.startDate);
            const end = l.endDate ? new Date(l.endDate) : new Date(start);
            const uId = l.userId?.$oid || l.userId?.toString();
            if (!uId) return;

            let current = new Date(start);
            while (current <= end) {
                const week = `W${getWeekNumber(current)}-${current.getFullYear()}`;
                if (!weeklyData[week]) {
                    weeklyData[week] = { presentDays: {}, leaveDays: {}, leaveTypes: {}, range: getWeekRange(current) };
                }
                if (!weeklyData[week].leaveDays[uId]) weeklyData[week].leaveDays[uId] = new Set();
                
                // Add leave day if it's not Sunday (since Sundays don't deduct from standard 6-day denominator usually, but we handle that in aggregation)
                weeklyData[week].leaveDays[uId].add(current.getDay());
                
                // Track leave type distribution
                const leaveType = l.type || 'Other';
                weeklyData[week].leaveTypes[leaveType] = (weeklyData[week].leaveTypes[leaveType] || 0) + 1;

                current.setDate(current.getDate() + 1);
            }
        });

        const detailedAttendance = {};
        const availableWeeks = [];
        let weeklyTrends = Object.keys(weeklyData).sort().map(week => {
            availableWeeks.push(week);
            const w = weeklyData[week];
            
            let sumPresentPct = 0;
            let sumLeavePct = 0;
            let sumAbsentPct = 0;

            const weekDays = [1, 2, 3, 4, 5, 6, 0];

            // Build export details for this week
            const employeeDetails = activeEmployees.map(emp => {
                const id = emp._id.toString();
                const pDays = w.presentDays[id] || new Set();
                const lDays = w.leaveDays[id] || new Set();
                
                let ePresent = 0;
                let eLeave = 0;

                const dailyStatus = {};
                weekDays.forEach(day => {
                    if (pDays.has(day)) {
                        dailyStatus[day] = 'Present';
                        ePresent++;
                    } else if (lDays.has(day)) {
                        dailyStatus[day] = 'On Leave';
                        eLeave++;
                    } else {
                        dailyStatus[day] = 'Absent';
                    }
                });

                // Calculate individual percentage out of 6 days max
                let pPct = Math.min((ePresent / 6) * 100, 100);
                let lPct = Math.min((eLeave / 6) * 100, 100 - pPct);
                let aPct = Math.max(100 - pPct - lPct, 0);

                sumPresentPct += pPct;
                sumLeavePct += lPct;
                sumAbsentPct += aPct;

                let empName = 'Unknown';
                if (emp.fullName) {
                    empName = emp.fullName + (emp.lastName ? ' ' + emp.lastName : '');
                }
                return { name: empName, percentage: pPct.toFixed(1), dailyStatus };
            });
            detailedAttendance[week] = employeeDetails;

            let presentPct = parseFloat((sumPresentPct / activeCount).toFixed(1));
            let onLeavePct = parseFloat((sumLeavePct / activeCount).toFixed(1));
            let absentPct = parseFloat((sumAbsentPct / activeCount).toFixed(1));

            // Adjust to exactly 100% due to rounding
            const diff = (100.0 - (presentPct + onLeavePct + absentPct));
            if (Math.abs(diff) <= 0.2 && absentPct > 0) absentPct = parseFloat((absentPct + diff).toFixed(1));

            return {
                week,
                range: w.range,
                present: presentPct,
                onLeave: onLeavePct,
                absent: absentPct,
                leaveDistribution: w.leaveTypes || {},
                totalEmployees: activeCount
            };
        });

        if (attendanceWeek && attendanceWeek !== 'all') {
            weeklyTrends = weeklyTrends.filter(t => t.week === attendanceWeek);
            const temp = detailedAttendance[attendanceWeek];
            Object.keys(detailedAttendance).forEach(k => delete detailedAttendance[k]);
            if (temp) detailedAttendance[attendanceWeek] = temp;
        }

        res.json({
            success: true,
            data: {
                availableWeeks: [...new Set(availableWeeks)].sort(),
                weeklyTrends,
                detailedAttendance,
                customerExpenses: finalizedCustomerExpenses,
                dailyAttendances
            }
        });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false, error: err.message }); 
    }
});

router.get('/', (req, res) => res.redirect('/api/v1/dashboard/data'));

module.exports = router;
