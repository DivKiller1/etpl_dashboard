const express = require('express');
const router = express.Router();
const { Employee, Expense, LeaveRequest, Customer, Vendor, Site } = require('../utils/jsonDb');

// Helper to get mock trends/aging/etc if data is thin
const getMockData = (type) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    switch (type) {
        case 'leave_aging':
            return [
                { age: '0-3 Days', count: 12 },
                { age: '4-7 Days', count: 5 },
                { age: '8-15 Days', count: 3 },
                { age: '> 15 Days', count: 1 }
            ];
        case 'expense_stages':
            return [
                { stage: 'Draft', count: 8 },
                { stage: 'Manager Review', count: 15 },
                { stage: 'Accounts Review', count: 4 },
                { stage: 'Approved', count: 22 }
            ];
        case 'site_pipeline':
            return [
                { stage: 'Lead', count: 50 },
                { stage: 'Survey', count: 35 },
                { stage: 'BOQ', count: 20 },
                { stage: 'PO', count: 12 },
                { stage: 'Work Started', count: 8 }
            ];
        case 'attendance_trend':
            return months.map(m => ({ month: m, present: Math.floor(Math.random() * 20) + 80, absent: Math.floor(Math.random() * 10) }));
        case 'stale_requests':
            return [
                { id: 'LR-102', type: 'Leave', employee: 'John Doe', daysStale: 5, status: 'Pending Manager' },
                { id: 'EX-504', type: 'Expense', employee: 'Jane Smith', daysStale: 8, status: 'Pending Accounts' }
            ];
        case 'stuck_sites':
            return [
                { id: 'SITE-001', name: 'Delhi NCR Tower', status: 'On-Hold', reason: 'Material Delay' },
                { id: 'SITE-005', name: 'Mumbai Metro A', status: 'On-Hold', reason: 'Permit Pending' }
            ];
        case 'arc_expiring':
            return [
                { customer: 'Reliance Jio', expiry: '2026-05-15', value: '₹50,00,000' },
                { customer: 'Airtel', expiry: '2026-06-01', value: '₹25,00,000' }
            ];
        default:
            return [];
    }
};

// 1. ADMIN DASHBOARD
router.get('/admin', async (req, res) => {
    try {
        const totalSites = await Site.countDocuments();
        const totalEmployees = await Employee.countDocuments();
        const pendingLeaves = await LeaveRequest.countDocuments({ status: 'Pending' });
        const pendingExpenses = await Expense.countDocuments({ status: 'Pending' });
        const totalCustomers = await Customer.countDocuments();
        const totalVendors = await Vendor.countDocuments();

        const sitesByStatus = await Site.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
        const expensesByStatus = await Expense.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
        
        res.json({
            success: true,
            data: {
                kpis: { totalSites, totalEmployees, pendingLeaves, pendingExpenses, totalCustomers, totalVendors },
                approvals: {
                    backlog: pendingLeaves + pendingExpenses,
                    leaveAging: getMockData('leave_aging'),
                    expenseStages: getMockData('expense_stages'),
                    turnaroundTrend: [1.2, 1.5, 1.1, 0.9, 1.4, 1.0],
                    staleRequests: getMockData('stale_requests')
                },
                hr: {
                    attendanceToday: { present: 145, absent: 12 },
                    attendanceTrend: getMockData('attendance_trend'),
                    leaveDistribution: [ { status: 'Approved', count: 45 }, { status: 'Pending', count: 12 }, { status: 'Rejected', count: 3 } ],
                    roleDistribution: await Employee.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])
                },
                expenses: {
                    monthlyTotal: 450000,
                    statusDistribution: expensesByStatus,
                    dailyTrend: [12000, 15000, 11000, 18000, 14000, 16000],
                    topClaims: [
                        { name: 'Site Survey Travel', amount: 15000, employee: 'John Doe' },
                        { name: 'Hardware Purchase', amount: 45000, employee: 'Jane Smith' }
                    ]
                },
                operations: {
                    sitesByStatus,
                    pipeline: getMockData('site_pipeline'),
                    newSitesTrend: [5, 8, 12, 10, 15, 7],
                    stuckSites: getMockData('stuck_sites')
                },
                exceptions: {
                    leaveBeyondSLA: [ { id: 'LR-101', employee: 'Amit Shah', delayedBy: '3 Days' } ],
                    expenseBeyondSLA: [ { id: 'EX-202', employee: 'Rahul G', delayedBy: '5 Days' } ],
                    arcExpiring: getMockData('arc_expiring')
                }
            }
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 2. MANAGER DASHBOARD
router.get('/manager/:id', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                teamKpis: {
                    pendingLeaves: 3,
                    pendingExpenses: 5,
                    onLeaveToday: 2,
                    absentToday: 1
                },
                approvals: {
                    backlog: 8,
                    leaveAging: getMockData('leave_aging'),
                    expenseStages: getMockData('expense_stages'),
                    staleRequests: getMockData('stale_requests')
                },
                teamHr: {
                    attendanceToday: { present: 22, absent: 3 },
                    leaveStatus: [ { status: 'Approved', count: 10 }, { status: 'Pending', count: 3 } ]
                },
                expenseTracking: {
                    statusSplit: [ { status: 'Pending', count: 5 }, { status: 'Approved', count: 12 } ],
                    topClaims: [ { name: 'Fuel Reimbursement', amount: 2500, employee: 'Alex' } ]
                },
                siteTracking: {
                    sitesByStatus: [ { _id: 'Active', count: 8 }, { _id: 'On-Hold', count: 2 } ],
                    stuckSites: getMockData('stuck_sites')
                }
            }
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. HR DASHBOARD
router.get('/hr', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                workforceKpis: {
                    totalEmployees: await Employee.countDocuments(),
                    attendanceToday: { present: 145, absent: 12 },
                    leaveStatus: [ { status: 'Approved', count: 45 }, { status: 'Pending', count: 12 } ]
                },
                monitoring: {
                    attendanceTrend: getMockData('attendance_trend'),
                    leaveAging: getMockData('leave_aging'),
                    roleDistribution: await Employee.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])
                }
            }
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 4. ACCOUNTANT DASHBOARD
router.get('/accountant', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                expenseKpis: {
                    pendingApproval: await Expense.countDocuments({ status: 'Pending' }),
                    monthlyTotal: 450000
                },
                monitoring: {
                    statusDistribution: await Expense.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
                    trend: [12000, 15000, 11000, 18000, 14000, 16000],
                    topClaims: [ { name: 'Server Maintenance', amount: 50000, employee: 'IT Dept' } ],
                    aging: getMockData('leave_aging')
                }
            }
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 5. EMPLOYEE DASHBOARD
router.get('/employee/:id', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                personalKpis: {
                    attendanceToday: 'Present',
                    leaveStatus: 'None Pending',
                    expenseStatus: '1 Pending'
                },
                tracking: {
                    leaves: [ { status: 'Approved', count: 5 }, { status: 'Pending', count: 0 } ],
                    expenses: [ { status: 'Approved', count: 2 }, { status: 'Pending', count: 1 } ],
                    recentExpenses: [ { id: 'EX-999', date: '2026-04-25', amount: 1200, status: 'Pending' } ]
                }
            }
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generic route redirects to admin
router.get('/', async (req, res) => {
    res.redirect('/api/v1/dashboard/admin');
});

module.exports = router;
