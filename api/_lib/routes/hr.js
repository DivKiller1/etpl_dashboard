'use strict';
const express = require('express');
const router  = express.Router();
const { User, Customer, Site, Attendance, Expense, Leave } = require('../models');

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const empName = (u) =>
    [u.fullName, u.lastName].filter(Boolean).join(' ').trim() || 'Unknown';

const isSiteEng = (emp) => {
    const des  = (emp.designation || '').toLowerCase();
    const role = (emp.roleId      || '').toLowerCase();
    return des.includes('technician') || des.includes('engineer') || des.includes('field')
        || role.includes('technician') || role.includes('engineer');
};

/** Build shared context (active users, manager map, month boundaries) */
async function buildHrCtx(query) {
    const today      = query.date  || fmt(new Date());
    const month      = query.month || today.substring(0, 7);
    const [yr, mo]   = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd   = fmt(new Date(yr, mo, 0));

    // Filter options
    const stateFilter  = (query.state      && query.state      !== 'all') ? query.state      : null;
    const custFilter   = (query.customerId && query.customerId !== 'all') ? query.customerId : null;

    const allUsers = await User.find({ isDeleted: false }).lean();
    const allNameMap = {};
    const allEmailMap = {};
    allUsers.forEach(u => {
        const nm = empName(u);
        allNameMap[u._id.toString()] = nm;
        if (u.email) allEmailMap[u.email.toLowerCase().trim()] = nm;
    });

    const getManagerName = (emp) => {
        const mid = emp.managerId?.toString();
        if (mid && allNameMap[mid]) return allNameMap[mid];
        const email = emp.managerDetails?.email?.toLowerCase().trim();
        if (email && allEmailMap[email]) return allEmailMap[email];
        return emp.managerDetails?.name || 'N/A';
    };

    // Active employees (not suspended)
    let activeEmps = allUsers.filter(u => !u.isSuspended);

    // State filter via employee baseLocation
    if (stateFilter) {
        activeEmps = activeEmps.filter(e => (e.baseLocation || '').toLowerCase().includes(stateFilter.toLowerCase()));
    }

    const activeIds = activeEmps.map(e => e._id);

    // Customers
    const allCustomers = await Customer.find({}).lean();
    const customerMap  = {};
    allCustomers.forEach(c => { customerMap[c._id.toString()] = c.name; });

    return {
        today, month, monthStart, monthEnd,
        allUsers, activeEmps, activeIds,
        allNameMap, allEmailMap, getManagerName,
        customerMap, allCustomers,
        stateFilter, custFilter
    };
}

// ── 1. GET /headcount-summary ────────────────────────────────────────────────
router.get('/headcount-summary', async (req, res) => {
    try {
        const all        = await User.find({}).lean();
        const active     = all.filter(u => !u.isDeleted && !u.isSuspended);
        const suspended  = all.filter(u => !u.isDeleted && u.isSuspended);
        const deleted    = all.filter(u => u.isDeleted);

        const siteEngineers = active.filter(isSiteEng);
        const managers      = active.filter(u => {
            const des  = (u.designation || '').toLowerCase();
            const role = (u.roleId      || '').toLowerCase();
            return des.includes('manager') || des.includes('pm') || role.includes('manager');
        });
        const directors = active.filter(u => {
            const des  = (u.designation || '').toLowerCase();
            const role = (u.roleId      || '').toLowerCase();
            return des.includes('director') || role.includes('director');
        });
        const others = active.length - siteEngineers.length - managers.length - directors.length;

        const toRow = u => ({ name: [u.fullName, u.lastName].filter(Boolean).join(' ').trim() || u.name || 'Unknown', designation: u.designation || '—' });
        res.json({ success: true, data: {
            totalActive:    active.length,
            totalSuspended: suspended.length,
            totalDeleted:   deleted.length,
            totalAll:       all.length,
            breakdown: {
                siteEngineers: siteEngineers.length,
                managers:      managers.length,
                directors:     directors.length,
                others:        Math.max(0, others)
            },
            lists: {
                active:       active.map(toRow),
                suspended:    suspended.map(toRow),
                siteEngineers: siteEngineers.map(toRow),
                managers:     managers.map(toRow)
            }
        }});
    } catch (err) {
        console.error('[hr] /headcount-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 2. GET /leave-summary ────────────────────────────────────────────────────
router.get('/leave-summary', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeIds } = ctx;

        const leaves = await Leave.find({
            userId:    { $in: activeIds },
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart }
        }).lean();

        const pending  = leaves.filter(l => l.status === 'Pending').length;
        const approved = leaves.filter(l => l.status === 'Approved').length;
        const rejected = leaves.filter(l => l.status === 'Rejected').length;

        // Count by type
        const byType = {};
        leaves.forEach(l => {
            const t = l.type || 'Unknown';
            if (!byType[t]) byType[t] = { pending: 0, approved: 0, rejected: 0, total: 0 };
            const s = (l.status || '').toLowerCase();
            if (s === 'pending')  byType[t].pending++;
            else if (s === 'approved') byType[t].approved++;
            else if (s === 'rejected') byType[t].rejected++;
            byType[t].total++;
        });

        // Total approved days
        let totalApprovedDays = 0;
        leaves.filter(l => l.status === 'Approved').forEach(l => {
            const start  = new Date(Math.max(new Date(l.startDate), new Date(monthStart)));
            const end    = new Date(Math.min(new Date(l.endDate || l.startDate), new Date(monthEnd)));
            totalApprovedDays += Math.max(0, Math.floor((end - start) / 86400000) + 1);
        });

        res.json({ success: true, data: {
            total: leaves.length,
            pending, approved, rejected,
            totalApprovedDays,
            byType: Object.entries(byType).map(([type, counts]) => ({ type, ...counts }))
        }});
    } catch (err) {
        console.error('[hr] /leave-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 3. GET /leave-requests ───────────────────────────────────────────────────
// Query: status (Pending|Approved|Rejected|all), page, limit
router.get('/leave-requests', async (req, res) => {
    try {
        const ctx    = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeIds, allNameMap, getManagerName, allUsers } = ctx;
        const status = req.query.status || 'all';
        const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
        const limit  = Math.max(1, parseInt(req.query.limit || '20', 10));

        const userMap = {};
        allUsers.forEach(u => { userMap[u._id.toString()] = u; });

        const filter = {
            userId:    { $in: activeIds },
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart }
        };
        if (status !== 'all') filter.status = status;

        const total   = await Leave.countDocuments(filter);
        const records = await Leave.find(filter)
            .sort({ startDate: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const data = records.map(l => {
            const user = userMap[l.userId?.toString()];
            const start = new Date(l.startDate);
            const end   = new Date(l.endDate || l.startDate);
            const days  = Math.max(1, Math.floor((end - start) / 86400000) + 1);
            return {
                leaveId:     l._id.toString(),
                employeeId:  user?.employeeId || 'N/A',
                fullName:    user ? empName(user) : 'Unknown',
                designation: user?.designation || 'Staff',
                managerName: user ? getManagerName(user) : 'N/A',
                type:        l.type || 'Leave',
                startDate:   l.startDate,
                endDate:     l.endDate || l.startDate,
                days,
                status:      l.status || 'Unknown'
            };
        });

        res.json({ success: true, data, pagination: { total, page, limit } });
    } catch (err) {
        console.error('[hr] /leave-requests:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 4. GET /expense-summary ──────────────────────────────────────────────────
router.get('/expense-summary', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeIds, customerMap, custFilter } = ctx;

        const activeIdStrings = activeIds.map(id => id.toString());
        const expFilter = {
            $or: [
                { userId: { $in: activeIds } },
                { userId: { $in: activeIdStrings } }
            ],
            date: { $gte: monthStart, $lte: monthEnd }
        };
        if (custFilter) expFilter.customerId = custFilter;

        const expenses = await Expense.find(expFilter).lean();

        const summary = { pending: { count: 0, amount: 0 }, approved: { count: 0, amount: 0 }, rejected: { count: 0, amount: 0 }, other: { count: 0, amount: 0 } };
        expenses.forEach(e => {
            const amt = e.amount || 0;
            const s   = (e.status || '').toLowerCase().trim();
            if (/^(pending|submitted|under.?review|awaiting)/.test(s)) {
                summary.pending.count++;  summary.pending.amount  += amt;
            } else if (/^(approved|paid|completed|settled|processed)/.test(s)) {
                summary.approved.count++; summary.approved.amount += amt;
            } else if (/^(rejected|declined|cancelled|denied)/.test(s)) {
                summary.rejected.count++; summary.rejected.amount += amt;
            } else {
                summary.other.count++;    summary.other.amount    += amt;
            }
        });

        // Per-customer breakdown
        const byCust = {};
        expenses.forEach(e => {
            const cid  = e.customerId?.toString();
            const cname = cid ? (customerMap[cid] || 'Unknown') : 'Unknown';
            if (!byCust[cname]) byCust[cname] = { pending: 0, approved: 0, rejected: 0, total: 0 };
            const s = (e.status || '').toLowerCase();
            const amt = e.amount || 0;
            byCust[cname].total += amt;
            if (s === 'pending')       byCust[cname].pending  += amt;
            else if (s === 'approved') byCust[cname].approved += amt;
            else if (s === 'rejected') byCust[cname].rejected += amt;
        });

        res.json({ success: true, data: {
            totalExpenses: expenses.length,
            totalAmount:   expenses.reduce((s, e) => s + (e.amount || 0), 0),
            ...summary,
            byCustomer: Object.entries(byCust).map(([name, v]) => ({ name, ...v }))
                               .sort((a, b) => b.total - a.total)
        }});
    } catch (err) {
        console.error('[hr] /expense-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 5. GET /regularization-summary ──────────────────────────────────────────
// "Regularization" = days where active employees had no attendance AND no approved leave
// These are the person-days that need attendance regularization.
router.get('/regularization-summary', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeEmps, today } = ctx;

        // Attendance in month
        const atts = await Attendance.find({
            date:   { $gte: monthStart, $lte: monthEnd },
            userId: { $in: activeEmps.map(e => e._id) }
        }).select('userId date').lean();

        const attSet = new Set(atts.map(a => `${a.userId.toString()}:${a.date}`));

        // Approved leaves in month
        const leaves = await Leave.find({
            status:    'Approved',
            userId:    { $in: activeEmps.map(e => e._id) },
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart }
        }).lean();

        const leaveSet = new Set();
        leaves.forEach(l => {
            const start = new Date(Math.max(new Date(l.startDate), new Date(monthStart)));
            const end   = new Date(Math.min(new Date(l.endDate || l.startDate), new Date(monthEnd)));
            let cur = new Date(start);
            while (cur <= end) {
                leaveSet.add(`${l.userId.toString()}:${fmt(cur)}`);
                cur.setDate(cur.getDate() + 1);
            }
        });

        // Count absent person-days (excluding Sundays, up to today)
        const [yr, mo] = ctx.month.split('-').map(Number);
        const daysInMonth = new Date(yr, mo, 0).getDate();
        const effectiveEnd = monthEnd < today ? monthEnd : today;

        let absentPersonDays = 0;
        const absentEmpIds = new Set();

        for (let day = 1; day <= daysInMonth; day++) {
            const ds = `${ctx.month}-${String(day).padStart(2, '0')}`;
            if (ds > effectiveEnd) break;
            if (new Date(ds).getDay() === 0) continue; // skip Sundays
            activeEmps.forEach(e => {
                const key = `${e._id.toString()}:${ds}`;
                if (!attSet.has(key) && !leaveSet.has(key)) {
                    absentPersonDays++;
                    absentEmpIds.add(e._id.toString());
                }
            });
        }

        res.json({ success: true, data: {
            absentPersonDays,
            absentEmployeeCount: absentEmpIds.size,
            // Schema gap: no explicit regularization tracking in DB
            pendingReg:   0, // SCHEMA GAP
            approvedReg:  0, // SCHEMA GAP
            rejectedReg:  0  // SCHEMA GAP
        }});
    } catch (err) {
        console.error('[hr] /regularization-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 6. GET /lwp-monthly ─────────────────────────────────────────────────────
router.get('/lwp-monthly', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeIds, allUsers, getManagerName } = ctx;

        const lwpLeaves = await Leave.find({
            status:    'Approved',
            type:      { $regex: /loss.of.pay|lwp/i },
            userId:    { $in: activeIds },
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart }
        }).lean();

        const userMap = {};
        allUsers.forEach(u => { userMap[u._id.toString()] = u; });

        let totalLwpDays = 0;
        const employees = lwpLeaves.map(l => {
            const user  = userMap[l.userId?.toString()];
            const start = new Date(Math.max(new Date(l.startDate), new Date(monthStart)));
            const end   = new Date(Math.min(new Date(l.endDate || l.startDate), new Date(monthEnd)));
            const days  = Math.max(0, Math.floor((end - start) / 86400000) + 1);
            totalLwpDays += days;
            return {
                employeeId:  user?.employeeId || 'N/A',
                fullName:    user ? empName(user) : 'Unknown',
                designation: user?.designation || 'Staff',
                managerName: user ? getManagerName(user) : 'N/A',
                startDate:   l.startDate,
                endDate:     l.endDate || l.startDate,
                days
            };
        }).sort((a, b) => b.days - a.days);

        res.json({ success: true, data: {
            lwpCount:    lwpLeaves.length,
            totalLwpDays,
            employees
        }});
    } catch (err) {
        console.error('[hr] /lwp-monthly:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 7. GET /attendance-heatmap ───────────────────────────────────────────────
// Last 30 days: { date, present, onLeave, absent }
router.get('/attendance-heatmap', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { today, activeEmps } = ctx;

        const ago30 = (() => {
            const d = new Date(today);
            d.setDate(d.getDate() - 29);
            return fmt(d);
        })();

        const atts = await Attendance.find({
            date:   { $gte: ago30, $lte: today },
            userId: { $in: activeEmps.map(e => e._id) }
        }).select('userId date').lean();

        const leaves = await Leave.find({
            status:    'Approved',
            userId:    { $in: activeEmps.map(e => e._id) },
            startDate: { $lte: today },
            endDate:   { $gte: ago30 }
        }).lean();

        const attByDate = {};
        atts.forEach(a => {
            if (!a.date) return;
            if (!attByDate[a.date]) attByDate[a.date] = new Set();
            attByDate[a.date].add(a.userId.toString());
        });

        const leaveByDate = {};
        leaves.forEach(l => {
            const start = new Date(l.startDate);
            const end   = new Date(l.endDate || l.startDate);
            let cur = new Date(Math.max(start, new Date(ago30)));
            while (cur <= end && cur <= new Date(today)) {
                const ds = fmt(cur);
                if (!leaveByDate[ds]) leaveByDate[ds] = new Set();
                leaveByDate[ds].add(l.userId.toString());
                cur.setDate(cur.getDate() + 1);
            }
        });

        const series = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds      = fmt(d);
            const present = attByDate[ds]?.size || 0;
            const onLeave = leaveByDate[ds]?.size || 0;
            const total   = activeEmps.length;
            const absent  = Math.max(0, total - present - onLeave);
            series.push({ date: ds, present, onLeave, absent, total });
        }

        res.json({ success: true, data: series });
    } catch (err) {
        console.error('[hr] /attendance-heatmap:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 8. GET /pending-approvals ────────────────────────────────────────────────
// Top pending leaves + expenses needing approval
router.get('/pending-approvals', async (req, res) => {
    try {
        const ctx = await buildHrCtx(req.query);
        const { monthStart, monthEnd, activeIds, allUsers, getManagerName } = ctx;

        const userMap = {};
        allUsers.forEach(u => { userMap[u._id.toString()] = u; });

        // Pending leaves (all time, not just month)
        const pendingLeaves = await Leave.find({
            status: 'Pending',
            userId: { $in: activeIds }
        }).sort({ startDate: 1 }).limit(20).lean();

        const leaveItems = pendingLeaves.map(l => {
            const user  = userMap[l.userId?.toString()];
            const start = new Date(l.startDate);
            const end   = new Date(l.endDate || l.startDate);
            const days  = Math.max(1, Math.floor((end - start) / 86400000) + 1);
            return {
                type:        'leave',
                employeeId:  user?.employeeId || 'N/A',
                fullName:    user ? empName(user) : 'Unknown',
                designation: user?.designation || 'Staff',
                managerName: user ? getManagerName(user) : 'N/A',
                detail:      `${l.type || 'Leave'} — ${l.startDate} to ${l.endDate || l.startDate} (${days}d)`,
                startDate:   l.startDate
            };
        });

        // Pending expenses
        const pendingExpenses = await Expense.find({
            status: 'Pending',
            userId: { $in: activeIds },
            date:   { $gte: monthStart, $lte: monthEnd }
        }).sort({ date: -1 }).limit(20).lean();

        const expenseItems = pendingExpenses.map(e => {
            const user = userMap[e.userId?.toString()];
            return {
                type:        'expense',
                employeeId:  user?.employeeId || 'N/A',
                fullName:    user ? empName(user) : 'Unknown',
                designation: user?.designation || 'Staff',
                managerName: user ? getManagerName(user) : 'N/A',
                detail:      `₹${(e.amount || 0).toLocaleString('en-IN')} — ${e.date}`,
                startDate:   e.date
            };
        });

        res.json({ success: true, data: {
            pendingLeaveCount:   pendingLeaves.length,
            pendingExpenseCount: pendingExpenses.length,
            items: [...leaveItems, ...expenseItems].sort((a, b) =>
                (a.startDate || '').localeCompare(b.startDate || ''))
        }});
    } catch (err) {
        console.error('[hr] /pending-approvals:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
