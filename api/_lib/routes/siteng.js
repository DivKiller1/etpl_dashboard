'use strict';
const express = require('express');
const router  = express.Router();
const { User, Site, Customer, Attendance, Leave } = require('../models');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date to YYYY-MM-DD */
const fmt = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Return the date string N days before `base` */
const daysAgo = (base, n) => {
    const d = new Date(base);
    d.setDate(d.getDate() - n);
    return fmt(d);
};

/** Returns true if the employee is a site/field engineer / technician */
const isSiteEng = (emp) => {
    const des  = (emp.designation || '').toLowerCase();
    const role = (emp.roleId      || '').toLowerCase();
    return des.includes('technician') || des.includes('engineer') || des.includes('field')
        || role.includes('technician') || role.includes('engineer');
};

/** Compose full name from user doc */
const empName = (emp) =>
    [emp.fullName, emp.lastName].filter(Boolean).join(' ').trim() || 'Unknown';

// ── Shared context builder ────────────────────────────────────────────────────
/**
 * Builds all the common data structures every endpoint needs.
 * This avoids duplicating the same 5 DB queries in every route handler.
 */
async function buildCtx(query) {
    const today     = query.date  || fmt(new Date());
    const month     = query.month || today.substring(0, 7);   // YYYY-MM
    const [yr, mo]  = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd   = fmt(new Date(yr, mo, 0));               // last day of month
    const ago30      = daysAgo(today, 30);
    const ago5       = daysAgo(today, 5);

    // ── Customers ────────────────────────────────────────────────────────────
    const allCustomers = await Customer.find({}).lean();
    const etplCust     = allCustomers.find(c => /etpl/i.test(c.name));
    const etplCustId   = etplCust ? etplCust._id.toString() : null;
    const customerMap  = {};
    allCustomers.forEach(c => { customerMap[c._id.toString()] = c.name; });

    // ── Sites (exclude ETPL's own sites) ─────────────────────────────────────
    const allSites = await Site.find({ isDeleted: false }).lean();
    const sites    = etplCustId
        ? allSites.filter(s => s.customerId && s.customerId.toString() !== etplCustId)
        : allSites;

    const siteMap     = {};
    const siteCustMap = {};
    const siteStateMap = {};
    const siteDistMap  = {};
    allSites.forEach(s => {
        const sid          = s._id.toString();
        siteMap[sid]       = s.name;
        siteStateMap[sid]  = s.state    || '';
        siteDistMap[sid]   = s.district || '';
        const cid          = s.customerId?.toString();
        siteCustMap[sid]   = cid ? (customerMap[cid] || 'Unknown') : 'Unknown';
    });

    // ── Active employees – site engineers only ───────────────────────────────
    const allActive  = await User.find({
        isDeleted:   false,
        isSuspended: false,
        roleId:      { $not: { $regex: /director/i } },
        designation: { $not: { $regex: /director/i } }
    }).lean();
    const engineers  = allActive.filter(isSiteEng);
    const engIdSet   = new Set(engineers.map(e => e._id.toString()));

    // ── User name lookup for manager resolution ──────────────────────────────
    const allUsers     = await User.find({}).select('_id fullName lastName email').lean();
    const userNameMap  = {};
    const userEmailMap = {};
    allUsers.forEach(u => {
        const nm = [u.fullName, u.lastName].filter(Boolean).join(' ').trim();
        if (nm) {
            userNameMap[u._id.toString()] = nm;
            if (u.email) userEmailMap[u.email.toLowerCase().trim()] = nm;
        }
    });

    const getManagerName = (emp) => {
        const mid = emp.managerId?.toString();
        if (mid && userNameMap[mid]) return userNameMap[mid];
        const email = emp.managerDetails?.email?.toLowerCase().trim();
        if (email && userEmailMap[email]) return userEmailMap[email];
        return emp.managerDetails?.name || 'N/A';
    };

    // ── Attendance for today ─────────────────────────────────────────────────
    const attToday    = await Attendance.find({ date: today }).lean();
    const engAttToday = attToday.filter(a => a.userId && engIdSet.has(a.userId.toString()));
    const presentEngIds = new Set(engAttToday.map(a => a.userId.toString()));

    // ── Leaves for today (approved only) ────────────────────────────────────
    const leavesToday = await Leave.find({
        status:    'Approved',
        startDate: { $lte: today },
        endDate:   { $gte: today }
    }).lean();
    const engLeavesToday = leavesToday.filter(l => l.userId && engIdSet.has(l.userId.toString()));
    const leaveEngIds    = new Set(engLeavesToday.map(l => l.userId.toString()));
    const lwpEngIds      = new Set(
        engLeavesToday
            .filter(l => /loss.of.pay|lwp/i.test(l.type || ''))
            .map(l => l.userId.toString())
    );

    // ── Optional query-string filters ────────────────────────────────────────
    const custFilter  = query.customerId || null;
    const mgFilter    = (query.managerId && query.managerId !== 'all') ? query.managerId : null;
    const stateFilter = (query.state     && query.state     !== 'all') ? query.state     : null;

    let filteredSites = sites;
    if (custFilter)  filteredSites = filteredSites.filter(s => s.customerId?.toString() === custFilter);
    if (stateFilter) filteredSites = filteredSites.filter(s => s.state === stateFilter);

    let filteredEngs = engineers;
    if (mgFilter) filteredEngs = engineers.filter(e => e.managerId?.toString() === mgFilter);
    const filteredEngIdSet = new Set(filteredEngs.map(e => e._id.toString()));

    return {
        today, month, monthStart, monthEnd, ago30, ago5,
        sites, filteredSites,
        siteMap, siteCustMap, siteStateMap, siteDistMap,
        customerMap, etplCustId,
        engineers, filteredEngs, engIdSet, filteredEngIdSet,
        userNameMap, userEmailMap, getManagerName,
        attToday, engAttToday, presentEngIds,
        leavesToday, engLeavesToday, leaveEngIds, lwpEngIds,
        custFilter, mgFilter, stateFilter
    };
}

// ── Route Handlers ────────────────────────────────────────────────────────────

/**
 * GET /kpi-summary
 * Returns top-level KPIs: site targets, field force, deployment ratio, month-on-month diff.
 */
router.get('/kpi-summary', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { today, filteredSites, filteredEngs, filteredEngIdSet, presentEngIds } = ctx;

        const targetSites      = filteredSites.length;
        const doneSites        = filteredSites.filter(s => /^(completed|hoto)$/i.test(s.status)).length;
        const visibilitySites  = filteredSites.filter(s => /^active$/i.test(s.status)).length;
        const achievedPercent  = targetSites > 0
            ? parseFloat(((doneSites / targetSites) * 100).toFixed(1))
            : 0;

        const totalFieldForce   = filteredEngs.length;
        const deployedManpower  = filteredEngs.filter(e => presentEngIds.has(e._id.toString())).length;
        const deployedRateToday = totalFieldForce > 0 ? deployedManpower / totalFieldForce : 0;

        // Compare with same calendar date last month
        const lastMonthDate = fmt((() => {
            const d = new Date(today);
            d.setMonth(d.getMonth() - 1);
            return d;
        })());
        const lastMonthCount = await Attendance.countDocuments({
            date:   lastMonthDate,
            userId: { $in: filteredEngs.map(e => e._id) }
        });
        const lastMonthRate = totalFieldForce > 0 ? lastMonthCount / totalFieldForce : 0;
        const ratioDiff     = parseFloat(((deployedRateToday - lastMonthRate) * 100).toFixed(1));

        const siteRow = s => ({ name: s.name || 'Unknown', state: s.state || '—', district: s.district || '—', status: s.status || '—' });
        const engRow  = e => ({ name: empName(e), designation: e.designation || '—', manager: ctx.getManagerName(e) });

        res.json({ success: true, data: {
            targetSites, doneSites, visibilitySites, achievedPercent,
            totalFieldForce, deployedManpower, ratioDiff,
            lists: {
                targetSites:     filteredSites.map(siteRow),
                doneSites:       filteredSites.filter(s => /^(completed|hoto)$/i.test(s.status)).map(siteRow),
                visibilitySites: filteredSites.filter(s => /^active$/i.test(s.status)).map(siteRow),
                totalFieldForce: filteredEngs.map(engRow),
                deployedManpower: filteredEngs.filter(e => presentEngIds.has(e._id.toString())).map(engRow)
            }
        }});
    } catch (err) {
        console.error('[siteng] /kpi-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /project-wise-progress
 * Per-customer: target sites, done sites, achieved %.
 */
router.get('/project-wise-progress', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { filteredSites, customerMap } = ctx;

        const custGroups = {};
        filteredSites.forEach(s => {
            const cid = s.customerId?.toString();
            if (!cid) return;
            if (!custGroups[cid]) custGroups[cid] = { name: customerMap[cid] || 'Unknown', sites: [] };
            custGroups[cid].sites.push(s);
        });

        const result = Object.entries(custGroups).map(([cid, g]) => {
            const target = g.sites.length;
            const done   = g.sites.filter(s => ['Completed', 'HOTO'].includes(s.status)).length;
            return {
                customerId:      cid,
                name:            g.name,
                target,
                done,
                achievedPercent: target > 0 ? parseFloat(((done / target) * 100).toFixed(1)) : 0
            };
        }).sort((a, b) => b.achievedPercent - a.achievedPercent);

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[siteng] /project-wise-progress:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /pm-performance
 * Per project-manager (inferred from engineer.managerId): assigned count, deployed today,
 * achieved %, utilization %.
 */
router.get('/pm-performance', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { filteredEngs, presentEngIds, userNameMap } = ctx;

        // Collect unique manager IDs referenced by filtered engineers
        const managerIdSet = new Set(
            filteredEngs.filter(e => e.managerId).map(e => e.managerId.toString())
        );

        const result = [...managerIdSet].map(mid => {
            const team            = filteredEngs.filter(e => e.managerId?.toString() === mid);
            const assignedCount   = team.length;
            const completedCount  = team.filter(e => presentEngIds.has(e._id.toString())).length;
            const utilizationPct  = assignedCount > 0
                ? parseFloat(((completedCount / assignedCount) * 100).toFixed(1))
                : 0;
            return {
                managerId:        mid,
                name:             userNameMap[mid] || 'Unknown Manager',
                assignedCount,
                completedCount,
                achievedPercent:  utilizationPct,
                utilizationPercent: utilizationPct
            };
        }).filter(p => p.assignedCount > 0)
          .sort((a, b) => b.utilizationPercent - a.utilizationPercent);

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[siteng] /pm-performance:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /sites-manpower-summary
 * Totals: totalSites, assignedSites, activeSites, upcomingSites, sitesWithoutEngineers,
 *         totalManpower, activeManpower, idleManpower, understaffedSites, overstaffedSites.
 */
router.get('/sites-manpower-summary', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { today, ago30, filteredSites, filteredEngs, engIdSet, presentEngIds, leaveEngIds } = ctx;

        const totalSites    = filteredSites.length;
        const activeSites   = filteredSites.filter(s => /^active$/i.test(s.status)).length;
        const upcomingSites = filteredSites.filter(s => /^planned$/i.test(s.status)).length;

        // Recent attendance in last 30 days: build siteId → Set<engineerId>
        const recentAtts = await Attendance.find({
            date: { $gte: ago30, $lte: today }
        }).select('siteId userId').lean();

        const siteEngMap = {};
        recentAtts.forEach(a => {
            const sid = a.siteId?.toString();
            const uid = a.userId?.toString();
            if (!sid || !uid || !engIdSet.has(uid)) return;
            if (!siteEngMap[sid]) siteEngMap[sid] = new Set();
            siteEngMap[sid].add(uid);
        });

        const assignedSites         = filteredSites.filter(s => siteEngMap[s._id.toString()]?.size > 0).length;
        const sitesWithoutEngineers = filteredSites.filter(s =>
            /^active$/i.test(s.status) && !siteEngMap[s._id.toString()]
        ).length;
        const understaffedSites = filteredSites.filter(s =>
            /^active$/i.test(s.status) && (siteEngMap[s._id.toString()]?.size || 0) === 1
        ).length;
        const overstaffedSites  = filteredSites.filter(s =>
            /^active$/i.test(s.status) && (siteEngMap[s._id.toString()]?.size || 0) >= 3
        ).length;

        const totalManpower  = filteredEngs.length;
        const activeManpower = filteredEngs.filter(e => presentEngIds.has(e._id.toString())).length;
        const idleManpower   = filteredEngs.filter(e =>
            !presentEngIds.has(e._id.toString()) && !leaveEngIds.has(e._id.toString())
        ).length;

        res.json({ success: true, data: {
            totalSites, assignedSites, activeSites, upcomingSites,
            sitesWithoutEngineers, totalManpower, activeManpower,
            idleManpower, understaffedSites, overstaffedSites
        }});
    } catch (err) {
        console.error('[siteng] /sites-manpower-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /engineer-status-today
 * Head-count breakdown: onSite, traveling, atOffice, idle, onLeave, onLWP, plus schema-gap zeros.
 */
router.get('/engineer-status-today', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { filteredEngs, filteredEngIdSet, engAttToday, siteCustMap,
                presentEngIds, leaveEngIds, lwpEngIds } = ctx;

        const filtAttToday = engAttToday.filter(a => filteredEngIdSet.has(a.userId?.toString()));

        const engById = {};
        filteredEngs.forEach(e => { engById[e._id.toString()] = e; });
        const engRow = e => ({ name: empName(e), designation: e.designation || '—' });

        const onSiteAtts = filtAttToday.filter(a => {
            const sid = a.siteId?.toString();
            return sid && !/etpl/i.test(siteCustMap[sid] || '');
        });
        const atOfficeAtts = filtAttToday.filter(a => {
            const sid = a.siteId?.toString();
            return !sid || /etpl/i.test(siteCustMap[sid] || '');
        });
        const travelingAtts = filtAttToday.filter(a =>
            /travel|tour|visit/i.test(a.checkInRemark || '')
        );
        const onLeaveList = filteredEngs.filter(e =>
            leaveEngIds.has(e._id.toString()) && !lwpEngIds.has(e._id.toString())
        );
        const onLWPList   = filteredEngs.filter(e => lwpEngIds.has(e._id.toString()));
        const idleList    = filteredEngs.filter(e =>
            !presentEngIds.has(e._id.toString()) && !leaveEngIds.has(e._id.toString())
        );

        const attToEng = atts => atts.map(a => {
            const e = engById[a.userId?.toString()];
            return e ? engRow(e) : null;
        }).filter(Boolean);

        res.json({ success: true, data: {
            onSite:    onSiteAtts.length,
            traveling: travelingAtts.length,
            atOffice:  atOfficeAtts.length,
            idle:      idleList.length,
            onLeave:   onLeaveList.length,
            onLWP:     onLWPList.length,
            materialCollection: 0,
            inTraining: 0,
            inSurvey:   0,
            onRest:     0,
            lists: {
                onSite:    attToEng(onSiteAtts),
                atOffice:  attToEng(atOfficeAtts),
                traveling: attToEng(travelingAtts),
                onLeave:   onLeaveList.map(engRow),
                onLWP:     onLWPList.map(engRow),
                idle:      idleList.map(engRow)
            }
        }});
    } catch (err) {
        console.error('[siteng] /engineer-status-today:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /manpower-trend
 * Last 30-day daily series: { date, onSite, atOffice, idle, traveling }.
 */
router.get('/manpower-trend', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { today, ago30, filteredEngs, filteredEngIdSet, siteCustMap } = ctx;

        // Fetch 30-day attendance for filtered engineers
        const atts30 = await Attendance.find({
            date:   { $gte: ago30, $lte: today },
            userId: { $in: filteredEngs.map(e => e._id) }
        }).select('userId date siteId checkInRemark').lean();

        // Fetch 30-day leaves for filtered engineers
        const leaves30 = await Leave.find({
            status:    'Approved',
            userId:    { $in: filteredEngs.map(e => e._id) },
            startDate: { $lte: today },
            endDate:   { $gte: ago30 }
        }).select('userId startDate endDate').lean();

        // Build daily attendance map
        const attByDate = {};
        atts30.forEach(a => {
            const d = a.date;
            if (!d) return;
            if (!attByDate[d]) attByDate[d] = [];
            attByDate[d].push(a);
        });

        // Build daily leave set
        const leaveByDate = {};
        leaves30.forEach(l => {
            const start = new Date(l.startDate);
            const end   = new Date(l.endDate || l.startDate);
            let cur = new Date(start);
            while (cur <= end) {
                const ds = fmt(cur);
                if (!leaveByDate[ds]) leaveByDate[ds] = new Set();
                leaveByDate[ds].add(l.userId.toString());
                cur.setDate(cur.getDate() + 1);
            }
        });

        const trend = [];
        for (let i = 29; i >= 0; i--) {
            const d       = daysAgo(today, i);
            const dayAtts = (attByDate[d] || []).filter(a =>
                filteredEngIdSet.has(a.userId?.toString())
            );
            const presentSet = new Set(dayAtts.map(a => a.userId.toString()));
            const leaveSet   = leaveByDate[d] || new Set();

            const onSite = dayAtts.filter(a => {
                const sid = a.siteId?.toString();
                return sid && !/etpl/i.test(siteCustMap[sid] || '');
            }).length;

            const atOffice = dayAtts.filter(a => {
                const sid = a.siteId?.toString();
                return !sid || /etpl/i.test(siteCustMap[sid] || '');
            }).length;

            const traveling = dayAtts.filter(a =>
                /travel|tour|visit/i.test(a.checkInRemark || '')
            ).length;

            const idle = filteredEngs.filter(e =>
                !presentSet.has(e._id.toString()) && !leaveSet.has(e._id.toString())
            ).length;

            trend.push({ date: d, onSite, atOffice, idle, traveling });
        }

        res.json({ success: true, data: trend });
    } catch (err) {
        console.error('[siteng] /manpower-trend:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /project-health
 * Per-customer: { name, target, done, pending, status ('On Track' | 'Behind') }.
 */
router.get('/project-health', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { filteredSites, customerMap } = ctx;

        const custGroups = {};
        filteredSites.forEach(s => {
            const cid = s.customerId?.toString();
            if (!cid) return;
            if (!custGroups[cid]) custGroups[cid] = { name: customerMap[cid] || 'Unknown', sites: [] };
            custGroups[cid].sites.push(s);
        });

        const result = Object.values(custGroups).map(g => {
            const target  = g.sites.length;
            const done    = g.sites.filter(s => ['Completed', 'HOTO'].includes(s.status)).length;
            const pending = target - done;
            const pct     = target > 0 ? parseFloat(((done / target) * 100).toFixed(1)) : 0;
            return { name: g.name, target, done, pending, status: pct >= 60 ? 'On Track' : 'Behind' };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[siteng] /project-health:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /alerts
 * Alert counts: idleOver5Count, sitesWithoutEngineers, highLwpCount, projectsBehind, manpowerShortage.
 */
router.get('/alerts', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { today, ago30, ago5, filteredSites, filteredEngs, filteredEngIdSet,
                presentEngIds, leaveEngIds, lwpEngIds } = ctx;

        // Engineers with no attendance in last 5 days
        const recentUserIds = await Attendance.find({
            date:   { $gte: ago5, $lte: today },
            userId: { $in: filteredEngs.map(e => e._id) }
        }).distinct('userId');
        const recentSet = new Set(recentUserIds.map(id => id.toString()));
        const idleOver5Count = filteredEngs.filter(e => !recentSet.has(e._id.toString())).length;

        // Active sites with no attendance in 30 days
        const recentSiteIds = await Attendance.find({
            date: { $gte: ago30, $lte: today }
        }).distinct('siteId');
        const recentSiteSet = new Set(recentSiteIds.map(id => id?.toString()).filter(Boolean));
        const sitesWithoutEngineers = filteredSites.filter(s =>
            /^active$/i.test(s.status) && !recentSiteSet.has(s._id.toString())
        ).length;

        // LWP today
        const highLwpCount = filteredEngs.filter(e => lwpEngIds.has(e._id.toString())).length;

        // Projects below 80% completion
        const custGroups = {};
        filteredSites.forEach(s => {
            const cid = s.customerId?.toString();
            if (!cid) return;
            if (!custGroups[cid]) custGroups[cid] = [];
            custGroups[cid].push(s);
        });
        const projectsBehind = Object.values(custGroups).filter(g => {
            const done = g.filter(s => ['Completed', 'HOTO'].includes(s.status)).length;
            return g.length > 0 && (done / g.length) < 0.8;
        }).length;

        // Manpower shortage: idle count if >20% of total force
        const totalManpower = filteredEngs.length;
        const idleNow = filteredEngs.filter(e =>
            !presentEngIds.has(e._id.toString()) && !leaveEngIds.has(e._id.toString())
        ).length;
        const manpowerShortage = totalManpower > 0 && (idleNow / totalManpower) > 0.2 ? idleNow : 0;

        res.json({ success: true, data: {
            idleOver5Count, sitesWithoutEngineers, highLwpCount, projectsBehind, manpowerShortage
        }});
    } catch (err) {
        console.error('[siteng] /alerts:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /monthly-lwp-idle-summary
 * Monthly totals: lwpCount (days), idleCount (person-days), evCount (0 – schema gap),
 *                 leftCount (0 – schema gap).
 */
router.get('/monthly-lwp-idle-summary', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { month, monthStart, monthEnd, filteredEngs } = ctx;

        // All leaves in this month for filtered engineers
        const monthLeaves = await Leave.find({
            status:    'Approved',
            userId:    { $in: filteredEngs.map(e => e._id) },
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart }
        }).lean();

        // Count LWP days (clipped to month boundaries)
        let lwpCount = 0;
        monthLeaves.forEach(l => {
            if (!/loss.of.pay|lwp/i.test(l.type || '')) return;
            const start = new Date(Math.max(new Date(l.startDate), new Date(monthStart)));
            const end   = new Date(Math.min(new Date(l.endDate || l.startDate), new Date(monthEnd)));
            const days  = Math.max(0, Math.floor((end - start) / 86400000) + 1);
            lwpCount += days;
        });

        // Attendance in month for filtered engineers
        const monthAtts = await Attendance.find({
            date:   { $gte: monthStart, $lte: monthEnd },
            userId: { $in: filteredEngs.map(e => e._id) }
        }).select('userId date').lean();

        const attendedSet = new Set(monthAtts.map(a => `${a.userId.toString()}:${a.date}`));

        // Build leave days set for the month (clipped)
        const leaveDaysSet = new Set();
        monthLeaves.forEach(l => {
            const start = new Date(Math.max(new Date(l.startDate), new Date(monthStart)));
            const end   = new Date(Math.min(new Date(l.endDate || l.startDate), new Date(monthEnd)));
            let cur = new Date(start);
            while (cur <= end) {
                leaveDaysSet.add(`${l.userId.toString()}:${fmt(cur)}`);
                cur.setDate(cur.getDate() + 1);
            }
        });

        // Count idle person-days (excluding Sundays)
        const [yr, mo] = month.split('-').map(Number);
        const daysInMonth = new Date(yr, mo, 0).getDate();
        let idleCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const ds     = `${month}-${String(day).padStart(2, '0')}`;
            const dow    = new Date(ds).getDay();
            if (dow === 0) continue; // skip Sundays
            filteredEngs.forEach(e => {
                const key = `${e._id.toString()}:${ds}`;
                if (!attendedSet.has(key) && !leaveDaysSet.has(key)) idleCount++;
            });
        }

        // evCount / leftCount: no schema tracking for these
        res.json({ success: true, data: {
            lwpCount,
            idleCount,
            evCount:   0, // SCHEMA GAP: no EV-status tracking
            leftCount: 0  // SCHEMA GAP: no employee-exit tracking in current month
        }});
    } catch (err) {
        console.error('[siteng] /monthly-lwp-idle-summary:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /idle-engineers
 * Top-5 idle engineers (no attendance in last 5 days), sorted by idle days desc.
 * Returns: { fullName, lastProject, lastLocation, idleDays, status }.
 */
router.get('/idle-engineers', async (req, res) => {
    try {
        const ctx = await buildCtx(req.query);
        const { today, ago5, filteredEngs, siteMap, siteCustMap, siteStateMap, siteDistMap } = ctx;

        // Engineers with no attendance in last 5 days
        const recentIds = await Attendance.find({
            date:   { $gte: ago5, $lte: today },
            userId: { $in: filteredEngs.map(e => e._id) }
        }).distinct('userId');
        const recentSet = new Set(recentIds.map(id => id.toString()));

        const idleEngs = filteredEngs.filter(e => !recentSet.has(e._id.toString()));

        // Last attendance for idle engineers
        const lastAtts = await Attendance.aggregate([
            { $match:  { userId: { $in: idleEngs.map(e => e._id) } } },
            { $sort:   { date: -1 } },
            { $group:  { _id: '$userId', lastAtt: { $first: '$$ROOT' } } }
        ]);
        const lastAttMap = {};
        lastAtts.forEach(r => { lastAttMap[r._id.toString()] = r.lastAtt; });

        const result = idleEngs.map(e => {
            const la       = lastAttMap[e._id.toString()];
            const lastSid  = la?.siteId?.toString();
            const lastDate = la?.date;
            const idleDays = lastDate
                ? Math.ceil((new Date(today) - new Date(lastDate)) / 86400000)
                : 999;
            return {
                fullName:     empName(e),
                lastProject:  lastSid ? (siteCustMap[lastSid] || 'Unknown') : 'N/A',
                lastLocation: lastSid
                    ? [siteStateMap[lastSid], siteDistMap[lastSid]].filter(Boolean).join(', ') || 'N/A'
                    : 'N/A',
                idleDays,
                status: 'Idle'
            };
        }).sort((a, b) => b.idleDays - a.idleDays).slice(0, 5);

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[siteng] /idle-engineers:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /idle-engineers-detailed
 * Paginated idle-engineer list with full fields.
 * Query params: page (default 1), limit (default 10).
 * Returns: data[], pagination: { total, page, limit }.
 */
router.get('/idle-engineers-detailed', async (req, res) => {
    try {
        const ctx   = await buildCtx(req.query);
        const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
        const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
        const { today, ago5, filteredEngs, siteMap, siteCustMap, siteStateMap, siteDistMap, getManagerName } = ctx;

        // Engineers with no attendance in last 5 days
        const recentIds = await Attendance.find({
            date:   { $gte: ago5, $lte: today },
            userId: { $in: filteredEngs.map(e => e._id) }
        }).distinct('userId');
        const recentSet = new Set(recentIds.map(id => id.toString()));

        const idleEngs = filteredEngs.filter(e => !recentSet.has(e._id.toString()));
        const total    = idleEngs.length;

        // Last attendance
        const lastAtts = await Attendance.aggregate([
            { $match:  { userId: { $in: idleEngs.map(e => e._id) } } },
            { $sort:   { date: -1 } },
            { $group:  { _id: '$userId', lastAtt: { $first: '$$ROOT' } } }
        ]);
        const lastAttMap = {};
        lastAtts.forEach(r => { lastAttMap[r._id.toString()] = r.lastAtt; });

        const sorted = idleEngs.map(e => {
            const la       = lastAttMap[e._id.toString()];
            const lastSid  = la?.siteId?.toString();
            const lastDate = la?.date;
            const idleDays = lastDate
                ? Math.ceil((new Date(today) - new Date(lastDate)) / 86400000)
                : 999;
            return {
                employeeId:   e.employeeId || 'N/A',
                fullName:     empName(e),
                designation:  e.designation || e.roleId || 'Staff',
                managerName:  getManagerName(e),
                lastProject:  lastSid ? (siteCustMap[lastSid] || 'Unknown') : 'N/A',
                lastLocation: lastSid
                    ? [siteStateMap[lastSid], siteDistMap[lastSid]].filter(Boolean).join(', ') || 'N/A'
                    : 'N/A',
                idleDays,
                reason: 'No Attendance Recorded'
            };
        }).sort((a, b) => b.idleDays - a.idleDays);

        const paginated = sorted.slice((page - 1) * limit, page * limit);

        res.json({ success: true, data: paginated, pagination: { total, page, limit } });
    } catch (err) {
        console.error('[siteng] /idle-engineers-detailed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
