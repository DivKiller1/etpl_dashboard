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
        }).select('_id fullName lastName roleId designation employeeId dateOfJoining managerDetails managerId baseLocation isSuspended');
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

        // Build a map of all users to resolve manager full names
        const allUsersForManagers = await User.find({}).select('_id fullName lastName email');
        const userFullNameMap = {};
        const userEmailFullNameMap = {};
        allUsersForManagers.forEach(u => {
            let name = u.fullName || '';
            if (u.lastName) {
                name += ' ' + u.lastName;
            }
            name = name.trim();
            if (name) {
                userFullNameMap[u._id.toString()] = name;
                if (u.email) {
                    userEmailFullNameMap[u.email.toLowerCase().trim()] = name;
                }
            }
        });

        const activeEmployeesDetails = activeEmployees.map(emp => {
            let empName = 'Unknown';
            if (emp.fullName) {
                empName = emp.fullName + (emp.lastName ? ' ' + emp.lastName : '');
            }
            
            let mName = 'N/A';
            if (emp.managerId && userFullNameMap[emp.managerId.toString()]) {
                mName = userFullNameMap[emp.managerId.toString()];
            } else if (emp.managerDetails && emp.managerDetails.email && userEmailFullNameMap[emp.managerDetails.email.toLowerCase().trim()]) {
                mName = userEmailFullNameMap[emp.managerDetails.email.toLowerCase().trim()];
            } else if (emp.managerDetails && emp.managerDetails.name) {
                mName = emp.managerDetails.name;
            }

            return {
                _id: emp._id,
                employeeId: emp.employeeId || '',
                fullName: empName,
                designation: emp.designation || emp.roleId || 'Staff',
                dateOfJoining: emp.dateOfJoining || '',
                managerName: mName,
                baseLocation: emp.baseLocation || '',
                isSuspended: emp.isSuspended || false
            };
        });

        res.json({
            success: true,
            data: {
                availableWeeks: [...new Set(availableWeeks)].sort(),
                weeklyTrends,
                detailedAttendance,
                customerExpenses: finalizedCustomerExpenses,
                dailyAttendances,
                employees: activeEmployeesDetails
            }
        });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false, error: err.message }); 
    }
});


router.get('/director-data', async (req, res) => {
    try {
        const today = req.query.date || new Date().toISOString().split('T')[0];
        const todayDate = new Date(today);
        if (isNaN(todayDate)) {
            return res.status(400).json({ success: false, error: 'Invalid date format' });
        }

        const getPastDateStr = (days) => {
            const d = new Date(todayDate);
            d.setDate(d.getDate() - days);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const thirtyDaysAgo = getPastDateStr(30);
        const sevenDaysAgo = getPastDateStr(7);
        const fiveDaysAgo = getPastDateStr(5);

        // Fetch all users to resolve manager full names and details
        const allUsersForManagers = await User.find({}).select('_id fullName lastName email');
        const userFullNameMap = {};
        const userEmailFullNameMap = {};
        allUsersForManagers.forEach(u => {
            let name = u.fullName || '';
            if (u.lastName) {
                name += ' ' + u.lastName;
            }
            name = name.trim();
            if (name) {
                userFullNameMap[u._id.toString()] = name;
                if (u.email) {
                    userEmailFullNameMap[u.email.toLowerCase().trim()] = name;
                }
            }
        });

        const getEmpManagerName = (emp) => {
            if (emp.managerId && userFullNameMap[emp.managerId.toString()]) {
                return userFullNameMap[emp.managerId.toString()];
            }
            if (emp.managerDetails && emp.managerDetails.name) {
                return emp.managerDetails.name;
            }
            if (emp.managerDetails && emp.managerDetails.email && userEmailFullNameMap[emp.managerDetails.email.toLowerCase().trim()]) {
                return userEmailFullNameMap[emp.managerDetails.email.toLowerCase().trim()];
            }
            return 'N/A';
        };

        // 1. Get Active Employees, exempting Directors
        const activeEmployees = await User.find({ 
            isDeleted: false, 
            isSuspended: false,
            roleId: { $not: { $regex: /director/i } },
            designation: { $not: { $regex: /director/i } }
        });
        const activeEmployeeIdsSet = new Set(activeEmployees.map(e => e._id.toString()));
        const totalEmployees = activeEmployees.length || 1;

        // Fetch ETPL customer ID dynamically to exclude its sites
        const etplCust = await Customer.findOne({ name: /etpl/i });
        const etplCustId = etplCust ? etplCust._id.toString() : null;

        // 2. Fetch Sites (excluding ETPL)
        const allSites = await Site.find({ isDeleted: false });
        const sites = etplCustId 
            ? allSites.filter(s => s.customerId && s.customerId.toString() !== etplCustId)
            : allSites;
        const totalSites = sites.length;

        const statusBreakdown = {};
        sites.forEach(s => {
            const st = s.status || 'Planned';
            statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
        });

        // 3. Customers (excluding ETPL)
        const allCustomers = await Customer.find({ isDeleted: false });
        const customersList = etplCustId 
            ? allCustomers.filter(c => c._id.toString() !== etplCustId)
            : allCustomers;

        const customerMap = {};
        allCustomers.forEach(c => {
            customerMap[c._id.toString()] = c.name;
        });

        const siteMap = {};
        const siteCustomerMap = {};
        const siteDistrictMap = {};
        const siteStateMap = {};
        allSites.forEach(s => {
            const sId = s._id.toString();
            siteMap[sId] = s.name;
            siteDistrictMap[sId] = s.district || '';
            siteStateMap[sId] = s.state || '';
            const cId = s.customerId?.toString();
            siteCustomerMap[sId] = cId ? (customerMap[cId] || 'Unknown Customer') : 'Unknown Customer';
        });

        // 4. Attendance & Leave for today
        const attendancesToday = await Attendance.find({ date: today }).lean();
        // Filter out present user IDs that are active and not checking in at ETPL sites
        const presentTodayActive = [];
        attendancesToday.forEach(att => {
            const uId = att.userId?.toString();
            if (uId && activeEmployeeIdsSet.has(uId)) {
                presentTodayActive.push(att.userId);
            }
        });
        const presentTodayCount = presentTodayActive.length;

        const leavesToday = await Leave.find({
            status: 'Approved',
            startDate: { $lte: today },
            endDate: { $gte: today }
        });
        const leavesTodayActive = leavesToday.filter(l => l.userId && activeEmployeeIdsSet.has(l.userId.toString()));
        const onLeaveCount = leavesTodayActive.length;

        // Accounted User IDs today
        const presentUserIdsStr = new Set(presentTodayActive.map(id => id.toString()));
        const leaveUserIdsStr = new Set(leavesTodayActive.map(l => l.userId.toString()));
        const accountedUserIds = new Set([...presentUserIdsStr, ...leaveUserIdsStr]);

        const attendanceNotMarkedCount = activeEmployees.filter(e => !accountedUserIds.has(e._id.toString())).length;

        // Shift start time at 9:45 AM (9:30 AM + 15m grace)
        const shiftStartUnix = Math.floor(new Date(`${today}T09:45:00+05:30`).getTime() / 1000);
        const lateAttendances = await Attendance.find({
            date: today,
            checkInTime: { $gt: shiftStartUnix }
        });
        const lateEmployeesToday = lateAttendances.filter(a => {
            const uId = a.userId?.toString();
            return uId && activeEmployeeIdsSet.has(uId);
        });
        const lateEmployeesCount = lateEmployeesToday.length;

        const lwpLeavesToday = leavesTodayActive.filter(l => (l.type || '').toUpperCase() === 'LOSS OF PAY');
        const onLeaveLwpCount = lwpLeavesToday.length;

        // Travel proxy
        const travelAttendances = await Attendance.find({
            date: today,
            checkInRemark: { $regex: /travel|tour|visit/i }
        });
        const travelingCount = travelAttendances.filter(a => {
            const uId = a.userId?.toString();
            return uId && activeEmployeeIdsSet.has(uId);
        }).length;

        const idleManpowerCount = attendanceNotMarkedCount;

        // Site engineer filters
        const isSiteEngineer = (emp) => {
            const des = (emp.designation || '').toLowerCase();
            const role = (emp.roleId || '').toLowerCase();
            return des.includes('technician') || des.includes('engineer') || des.includes('field') || role.includes('technician') || role.includes('engineer');
        };
        const activeSiteEngineers = activeEmployees.filter(isSiteEngineer);
        const activeSiteEngineerIdsSet = new Set(activeSiteEngineers.map(e => e._id.toString()));
        const totalSiteEngineersCount = activeSiteEngineers.length;

        const deployedSiteEngineers = presentTodayActive.filter(id => activeSiteEngineerIdsSet.has(id.toString()));
        const deployedSiteEngineersCount = deployedSiteEngineers.length;

        const idleSiteEngineersCount = activeSiteEngineers.filter(e => !presentUserIdsStr.has(e._id.toString()) && !leaveUserIdsStr.has(e._id.toString())).length;

        const siteEngineersOnLeaveCount = leavesTodayActive.filter(l => l.userId && activeSiteEngineerIdsSet.has(l.userId.toString())).length;
        const siteEngineersOnLwpCount = lwpLeavesToday.filter(l => l.userId && activeSiteEngineerIdsSet.has(l.userId.toString())).length;

        // Sites without engineers
        const activeSiteIds = await Attendance.find({ date: { $gte: thirtyDaysAgo } }).distinct('siteId');
        const activeSiteIdsStr = new Set(activeSiteIds.map(id => id ? id.toString() : ''));
        const sitesWithoutEngineers = sites.filter(s => !activeSiteIdsStr.has(s._id.toString()) && (s.status === 'Active'));
        const sitesWithoutEngineersCount = sitesWithoutEngineers.length;

        // Sites at risk
        const recentSiteIds = await Attendance.find({ date: { $gte: sevenDaysAgo } }).distinct('siteId');
        const recentSiteIdsStr = new Set(recentSiteIds.map(id => id ? id.toString() : ''));
        const sitesAtRisk = sites.filter(s => !recentSiteIdsStr.has(s._id.toString()) && (s.status === 'Active'));
        const sitesAtRiskCount = sitesAtRisk.length;

        // 5. Project Performance Overview (excluding ETPL)
        const projectPerformance = [];
        for (const cust of customersList) {
            const custSites = sites.filter(s => s.customerId && s.customerId.toString() === cust._id.toString());
            const total = custSites.length;
            const completed = custSites.filter(s => s.status === 'Completed' || s.status === 'HOTO').length;
            const pending = total - completed;
            const achievementPercent = total > 0 ? parseFloat(((completed / total) * 100).toFixed(1)) : 0;

            projectPerformance.push({
                customerId: cust._id,
                name: cust.name,
                totalSites: total,
                completedSites: completed,
                pendingSites: pending,
                achievementPercent: achievementPercent
            });
        }

        // 6. Project Manager Performance (utilization based on active employees only)
        const managers = activeEmployees.filter(e => {
            const des = (e.designation || '').toLowerCase();
            const role = (e.roleId || '').toLowerCase();
            return des.includes('project manager') || des.includes('pm') || role === 'manager';
        });

        const managerPerformance = [];
        for (const pm of managers) {
            const team = activeEmployees.filter(e => e.managerId && e.managerId.toString() === pm._id.toString());
            const teamSize = team.length;
            const deployed = team.filter(e => presentUserIdsStr.has(e._id.toString()));
            const deployedCount = deployed.length;
            const utilizationPercent = teamSize > 0 ? parseFloat(((deployedCount / teamSize) * 100).toFixed(1)) : 0;

            managerPerformance.push({
                _id: pm._id,
                name: pm.fullName + (pm.lastName ? ' ' + pm.lastName : ''),
                teamSize: teamSize,
                deployedCount: deployedCount,
                utilizationPercent: utilizationPercent
            });
        }

        // 7. Manpower Planning
        const manpowerPlanning = {
            available: totalEmployees,
            utilized: presentTodayActive.length,
            idle: totalEmployees - presentTodayActive.length,
            required: totalEmployees + 10,
            gap: 10
        };

        // 8. Critical Alerts details
        const recentlyActiveIds = await Attendance.find({ date: { $gte: fiveDaysAgo } }).distinct('userId');
        const recentlyActiveIdsStr = new Set(recentlyActiveIds.map(id => id ? id.toString() : ''));
        const idleEngineersAlert = activeSiteEngineers
            .filter(e => !recentlyActiveIdsStr.has(e._id.toString()))
            .map(e => ({
                _id: e._id,
                employeeId: e.employeeId,
                fullName: e.fullName + (e.lastName ? ' ' + e.lastName : ''),
                designation: e.designation,
                managerName: getEmpManagerName(e)
            }));

        const sitesWithoutEngineerAlert = sitesWithoutEngineers.map(s => {
            const cust = customersList.find(c => c._id.toString() === s.customerId?.toString());
            return {
                _id: s._id,
                siteId: s.siteId,
                name: s.name,
                projectName: cust ? cust.name : 'Unknown Project',
                state: s.state,
                district: s.district
            };
        });

        const projectsBehindTarget = projectPerformance.filter(p => p.achievementPercent < 80.0);
        const highLwpCount = onLeaveLwpCount;
        const absentCount = totalEmployees - (presentTodayActive.length + onLeaveCount);
        const highAbsenteeismPercent = totalEmployees > 0 ? parseFloat(((absentCount / totalEmployees) * 100).toFixed(1)) : 0;

        // 9. Fetch Site Engineer Geolocation Points
        const engineerLocations = [];
        attendancesToday.forEach(att => {
            const uId = att.userId?.toString();
            if (uId && activeEmployeeIdsSet.has(uId)) {
                const emp = activeEmployees.find(e => e._id.toString() === uId);
                if (emp && isSiteEngineer(emp)) {
                    if (att.locationIn && att.locationIn.coordinates && att.locationIn.coordinates.length >= 2) {
                        const sId = att.siteId?.toString();
                        const siteName = sId ? (siteMap[sId] || 'Office') : 'Office';
                        const customerName = sId ? (siteCustomerMap[sId] || 'ETPL') : 'ETPL';

                        const checkInTimeFormatted = att.checkInTime 
                            ? new Date(att.checkInTime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                            : 'N/A';
                        
                        engineerLocations.push({
                            lat: att.locationIn.coordinates[1],
                            lng: att.locationIn.coordinates[0],
                            engineerName: emp.fullName + (emp.lastName ? ' ' + emp.lastName : ''),
                            checkInTime: checkInTimeFormatted,
                            siteName,
                            customerName,
                            managerName: getEmpManagerName(emp),
                            district: sId ? (siteDistrictMap[sId] || '') : '',
                            state: sId ? (siteStateMap[sId] || '') : ''
                        });
                    }
                }
            }
        });

        // 10. Construct Drilldown lists for all 12 KPI Cards
        const detailTotalEmployees = activeEmployees.map(e => ({
            employeeId: e.employeeId || 'N/A',
            fullName: e.fullName + (e.lastName ? ' ' + e.lastName : ''),
            designation: e.designation || 'Staff',
            baseLocation: e.baseLocation || 'N/A',
            managerName: getEmpManagerName(e)
        }));

        const detailPresentToday = [];
        attendancesToday.forEach(att => {
            const uId = att.userId?.toString();
            if (uId && activeEmployeeIdsSet.has(uId)) {
                const emp = activeEmployees.find(e => e._id.toString() === uId);
                const sId = att.siteId?.toString();
                const siteName = sId ? (siteMap[sId] || 'Office') : 'Office';
                const customerName = sId ? (siteCustomerMap[sId] || 'ETPL') : 'ETPL';

                const checkInTimeFormatted = att.checkInTime 
                    ? new Date(att.checkInTime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : 'N/A';

                detailPresentToday.push({
                    employeeId: emp.employeeId || 'N/A',
                    fullName: emp.fullName + (emp.lastName ? ' ' + emp.lastName : ''),
                    designation: emp.designation || 'Staff',
                    siteName,
                    customerName,
                    checkInTime: checkInTimeFormatted
                });
            }
        });

        const detailOnLeave = leavesTodayActive.map(l => {
            const emp = activeEmployees.find(e => e._id.toString() === l.userId.toString());
            return {
                employeeId: emp ? emp.employeeId : 'N/A',
                fullName: emp ? emp.fullName + (emp.lastName ? ' ' + emp.lastName : '') : 'Unknown',
                designation: emp ? emp.designation : 'Staff',
                type: l.type || 'Other',
                startDate: l.startDate,
                endDate: l.endDate,
                duration: l.amount || 1,
                managerName: emp ? getEmpManagerName(emp) : 'N/A'
            };
        });

        const detailUnmarked = activeEmployees.filter(e => !accountedUserIds.has(e._id.toString())).map(e => ({
            employeeId: e.employeeId || 'N/A',
            fullName: e.fullName + (e.lastName ? ' ' + e.lastName : ''),
            designation: e.designation || 'Staff',
            baseLocation: e.baseLocation || 'N/A',
            managerName: getEmpManagerName(e)
        }));

        const detailTotalSites = sites.map(s => {
            const cust = customersList.find(c => c._id.toString() === s.customerId?.toString());
            return {
                siteId: s.siteId || 'N/A',
                name: s.name,
                projectName: cust ? cust.name : 'Unknown Project',
                status: s.status || 'Planned',
                state: s.state || 'N/A',
                district: s.district || 'N/A'
            };
        });

        const detailLateEmployees = [];
        lateEmployeesToday.forEach(att => {
            const emp = activeEmployees.find(e => e._id.toString() === att.userId?.toString());
            if (emp) {
                const sId = att.siteId?.toString();
                const siteName = sId ? (siteMap[sId] || 'Office') : 'Office';
                const checkInTimeFormatted = att.checkInTime 
                    ? new Date(att.checkInTime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : 'N/A';
                detailLateEmployees.push({
                    employeeId: emp.employeeId || 'N/A',
                    fullName: emp.fullName + (emp.lastName ? ' ' + emp.lastName : ''),
                    designation: emp.designation || 'Staff',
                    siteName,
                    checkInTime: checkInTimeFormatted
                });
            }
        });

        const detailSitesWithoutEngineers = sitesWithoutEngineers.map(s => {
            const cust = customersList.find(c => c._id.toString() === s.customerId?.toString());
            return {
                siteId: s.siteId || 'N/A',
                name: s.name,
                projectName: cust ? cust.name : 'Unknown Project',
                status: s.status || 'Planned',
                state: s.state || 'N/A',
                district: s.district || 'N/A'
            };
        });

        const detailSitesAtRisk = sitesAtRisk.map(s => {
            const cust = customersList.find(c => c._id.toString() === s.customerId?.toString());
            return {
                siteId: s.siteId || 'N/A',
                name: s.name,
                projectName: cust ? cust.name : 'Unknown Project',
                status: s.status || 'Planned',
                state: s.state || 'N/A',
                district: s.district || 'N/A'
            };
        });

        const detailTotalSiteEngineers = activeSiteEngineers.map(e => ({
            employeeId: e.employeeId || 'N/A',
            fullName: e.fullName + (e.lastName ? ' ' + e.lastName : ''),
            designation: e.designation || 'Staff',
            baseLocation: e.baseLocation || 'N/A',
            managerName: getEmpManagerName(e)
        }));

        const detailDeployedSiteEngineers = [];
        attendancesToday.forEach(att => {
            const uId = att.userId?.toString();
            if (uId && activeSiteEngineerIdsSet.has(uId)) {
                const emp = activeSiteEngineers.find(e => e._id.toString() === uId);
                const sId = att.siteId?.toString();
                const siteName = sId ? (siteMap[sId] || 'Office') : 'Office';
                const customerName = sId ? (siteCustomerMap[sId] || 'ETPL') : 'ETPL';

                const checkInTimeFormatted = att.checkInTime 
                    ? new Date(att.checkInTime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : 'N/A';

                detailDeployedSiteEngineers.push({
                    employeeId: emp.employeeId || 'N/A',
                    fullName: emp.fullName + (emp.lastName ? ' ' + emp.lastName : ''),
                    designation: emp.designation || 'Staff',
                    siteName,
                    checkInTime: checkInTimeFormatted
                });
            }
        });

        const detailIdleSiteEngineers = activeSiteEngineers.filter(e => !presentUserIdsStr.has(e._id.toString()) && !leaveUserIdsStr.has(e._id.toString())).map(e => ({
            employeeId: e.employeeId || 'N/A',
            fullName: e.fullName + (e.lastName ? ' ' + e.lastName : ''),
            designation: e.designation || 'Staff',
            baseLocation: e.baseLocation || 'N/A',
            managerName: getEmpManagerName(e)
        }));

        const detailSiteEngineersOnLeave = leavesTodayActive.filter(l => l.userId && activeSiteEngineerIdsSet.has(l.userId.toString())).map(l => {
            const emp = activeEmployees.find(e => e._id.toString() === l.userId.toString());
            return {
                employeeId: emp ? emp.employeeId : 'N/A',
                fullName: emp ? emp.fullName + (emp.lastName ? ' ' + emp.lastName : '') : 'Unknown',
                designation: emp ? emp.designation : 'Staff',
                type: l.type || 'Other',
                startDate: l.startDate,
                endDate: l.endDate,
                duration: l.amount || 1,
                managerName: emp ? getEmpManagerName(emp) : 'N/A'
            };
        });

        // 11. Trends (Last 30 Days)
        const startDateStr = getPastDateStr(29);
        const endDateStr = getPastDateStr(0);

        const allAttendancesTrend = await Attendance.find({
            date: { $gte: startDateStr, $lte: endDateStr }
        }).select('userId date siteId').lean();

        const allLeavesTrend = await Leave.find({
            status: 'Approved',
            $or: [
                { startDate: { $lte: endDateStr }, endDate: { $gte: startDateStr } }
            ]
        }).select('userId startDate endDate').lean();

        const attendancesByDate = {};
        allAttendancesTrend.forEach(a => {
            if (!a.date) return;
            const sId = a.siteId?.toString();
            const customerName = sId ? (siteCustomerMap[sId] || 'Office') : 'Office';
            if (customerName === 'ETPL') return; // Exclude ETPL from 30 day trends

            if (!attendancesByDate[a.date]) {
                attendancesByDate[a.date] = new Set();
            }
            if (a.userId) {
                attendancesByDate[a.date].add(a.userId.toString());
            }
        });

        const leavesByDate = {};
        allLeavesTrend.forEach(l => {
            if (!l.userId || !activeEmployeeIdsSet.has(l.userId.toString())) return;
            const start = new Date(l.startDate);
            const end = l.endDate ? new Date(l.endDate) : new Date(start);
            let current = new Date(start);
            while (current <= end) {
                const year = current.getFullYear();
                const month = String(current.getMonth() + 1).padStart(2, '0');
                const day = String(current.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;
                
                if (dateKey >= startDateStr && dateKey <= endDateStr) {
                    if (!leavesByDate[dateKey]) {
                        leavesByDate[dateKey] = new Set();
                    }
                    leavesByDate[dateKey].add(l.userId.toString());
                }
                current.setDate(current.getDate() + 1);
            }
        });

        const attendanceTrend = [];
        for (let i = 29; i >= 0; i--) {
            const dStr = getPastDateStr(i);
            const presentActiveSet = attendancesByDate[dStr] || new Set();
            const presentActive = Array.from(presentActiveSet).filter(id => activeEmployeeIdsSet.has(id)).length;
            
            const leavesActiveSet = leavesByDate[dStr] || new Set();
            const leavesActive = leavesActiveSet.size;
            
            const absentActive = Math.max(0, totalEmployees - (presentActive + leavesActive));

            attendanceTrend.push({
                date: dStr,
                present: presentActive,
                leave: leavesActive,
                absent: absentActive
            });
        }

        res.json({
            success: true,
            data: {
                workforce: {
                    totalEmployees,
                    presentToday: presentTodayCount,
                    onLeave: onLeaveCount,
                    attendanceNotMarked: attendanceNotMarkedCount,
                    lateEmployees: lateEmployeesCount,
                    onLeaveLwp: onLeaveLwpCount,
                    travelingEmployees: travelingCount,
                    idleManpower: idleManpowerCount,
                    siteEngineersOnLeave: siteEngineersOnLeaveCount
                },
                siteOperations: {
                    totalSites,
                    activeSites: statusBreakdown['Active'] || 0,
                    completedSites: statusBreakdown['Completed'] || 0,
                    plannedSites: statusBreakdown['Planned'] || 0,
                    sitesWithoutEngineers: sitesWithoutEngineersCount,
                    sitesAtRisk: sitesAtRiskCount,
                    statusBreakdown
                },
                engineerUtilization: {
                    totalEngineers: totalSiteEngineersCount,
                    deployedEngineers: deployedSiteEngineersCount,
                    idleEngineers: idleSiteEngineersCount,
                    onLeave: siteEngineersOnLeaveCount,
                    onLwp: siteEngineersOnLwpCount
                },
                projectPerformance,
                managerPerformance,
                manpowerPlanning,
                alerts: {
                    idleEngineers: idleEngineersAlert,
                    sitesWithoutEngineers: sitesWithoutEngineerAlert,
                    projectsBehind: projectsBehindTarget,
                    highLwpCount,
                    highAbsenteeism: highAbsenteeismPercent
                },
                charts: {
                    attendanceTrend,
                    workforceDistribution: {
                        present: presentTodayCount,
                        leave: onLeaveCount,
                        absent: totalEmployees - (presentTodayCount + onLeaveCount)
                    }
                },
                engineerLocations,
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
                details: {
                    totalEmployees: detailTotalEmployees,
                    presentToday: detailPresentToday,
                    onLeave: detailOnLeave,
                    unmarked: detailUnmarked,
                    totalSites: detailTotalSites,
                    lateEmployees: detailLateEmployees,
                    sitesWithoutEngineers: detailSitesWithoutEngineers,
                    sitesAtRisk: detailSitesAtRisk,
                    totalSiteEngineers: detailTotalSiteEngineers,
                    deployedSiteEngineers: detailDeployedSiteEngineers,
                    idleSiteEngineers: detailIdleSiteEngineers,
                    siteEngineersOnLeave: detailSiteEngineersOnLeave
                }
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/', (req, res) => res.redirect('/api/v1/dashboard/data'));

module.exports = router;

