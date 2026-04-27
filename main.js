import { 
    createIcons, LayoutDashboard, Users, Truck, FileText, UserPlus, 
    Calendar, Mail, Menu, ChevronDown, FileSpreadsheet, ClipboardList, 
    Shield, Settings, Gift, MapPin, FileCheck, CreditCard, Clock, Activity, TrendingUp, AlertTriangle, Filter
} from 'lucide';
import axios from 'axios';

const API_BASE_URL = '/api/v1';

// Initialize Lucide Icons
function initIcons() {
    createIcons({
        icons: {
            LayoutDashboard, Users, Truck, FileText, UserPlus, 
            Calendar, Mail, Menu, ChevronDown, FileSpreadsheet, 
            ClipboardList, Shield, Settings, Gift, MapPin, 
            FileCheck, CreditCard, Clock, Activity, TrendingUp, AlertTriangle, Filter
        }
    });
}

const state = {
    currentRole: 'admin',
    data: {}
};

// Router logic
function handleRouting() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/manager')) state.currentRole = 'manager';
    else if (path.includes('/hr')) state.currentRole = 'hr';
    else if (path.includes('/accountant')) state.currentRole = 'accountant';
    else if (path.includes('/employee')) state.currentRole = 'employee';
    else state.currentRole = 'admin';

    fetchDashboardData();
}

async function fetchDashboardData() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="dashboard-loading">Initializing Full Dashboard Experience...</div>';
    
    try {
        let endpoint = `/dashboard/${state.currentRole}`;
        if (state.currentRole === 'manager' || state.currentRole === 'employee') {
            endpoint += '/mock-id-123';
        }
        
        const response = await axios.get(`${API_BASE_URL}${endpoint}`);
        state.data = response.data.data;
        renderDashboard();
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        content.innerHTML = `<div class="error">Failed to load dashboard. Ensure backend is running.</div>`;
    }
}

function renderDashboard() {
    const content = document.getElementById('content');
    const role = state.currentRole;
    document.getElementById('breadcrumb').innerText = `${role.toUpperCase()} DASHBOARD`;

    switch (role) {
        case 'admin': renderAdmin(); break;
        case 'manager': renderManager(); break;
        case 'hr': renderHR(); break;
        case 'accountant': renderAccountant(); break;
        case 'employee': renderEmployee(); break;
    }
    
    initIcons();
}

// --- RENDERING HELPERS ---

function createStatCard(title, value, icon, color) {
    return `
        <div class="stat-card ${color}">
            <div class="stat-info">
                <h3>${value}</h3>
                <p>${title}</p>
            </div>
            <div class="stat-icon-wrapper">
                <i data-lucide="${icon}"></i>
            </div>
        </div>
    `;
}

function createChartCard(title, id) {
    return `
        <div class="chart-card">
            <h4>${title}</h4>
            <div id="${id}"></div>
        </div>
    `;
}

function createTableCard(title, headers, rows) {
    return `
        <div class="table-card">
            <div class="table-header"><h4>${title}</h4></div>
            <div class="table-responsive">
                <table>
                    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                    <tbody>
                        ${rows.length > 0 ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="'+headers.length+'" style="text-align:center;">No data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- ADMIN DASHBOARD ---
function renderAdmin() {
    const { kpis, approvals, hr, expenses, operations, exceptions } = state.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="dashboard-section">
            <h2 class="section-title">1.1 Core KPIs</h2>
            <div class="stats-grid">
                ${createStatCard('Total Sites', kpis.totalSites, 'map-pin', 'orange')}
                ${createStatCard('Total Employees', kpis.totalEmployees, 'users', 'cyan')}
                ${createStatCard('Pending Leave Approval', kpis.pendingLeaves, 'mail', 'navy')}
                ${createStatCard('Pending Expense Approval', kpis.pendingExpenses, 'credit-card', 'green')}
                ${createStatCard('Total Customers', kpis.totalCustomers, 'users', 'orange')}
                ${createStatCard('Total Vendors', kpis.totalVendors, 'truck', 'cyan')}
            </div>
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">1.2 Approval Monitoring</h2>
            <div class="stats-grid">
                ${createStatCard('Total Approval Backlog', approvals.backlog, 'clock', 'red')}
            </div>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Leave Pending by Time', 'leave-time-chart')}
                ${createChartCard('Expense Pending by Stage', 'expense-stage-chart')}
                ${createChartCard('Approval Turnaround Trend', 'turnaround-chart')}
            </div>
            ${createTableCard('Stale Requests (SLA Breaches)', ['Request ID', 'Type', 'Employee', 'Days Stale', 'Status'], approvals.staleRequests.map(r => [r.id, r.type, r.employee, r.daysStale, `<span class="badge badge-danger">${r.status}</span>`]))}
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">1.3 HR & Workforce</h2>
            <div class="charts-grid">
                ${createChartCard('Attendance Status Today', 'attendance-donut')}
                ${createChartCard('Daily Attendance Trend', 'attendance-line')}
                ${createChartCard('Leave by Status', 'leave-status-donut')}
                ${createChartCard('Employees by Role', 'role-bar')}
            </div>
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">1.4 Expense Analytics</h2>
            <div class="stats-grid">
                ${createStatCard('Expense This Month', '₹' + expenses.monthlyTotal.toLocaleString(), 'trending-up', 'green')}
            </div>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Expense by Status', 'expense-status-donut')}
                ${createChartCard('Daily Expense Trend', 'expense-trend-line')}
            </div>
            ${createTableCard('Top Expense Claims', ['Claim Name', 'Amount', 'Employee'], expenses.topClaims.map(c => [c.name, '₹' + c.amount.toLocaleString(), c.employee]))}
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">1.5 Site & Operations</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Sites by Status', 'sites-status-donut')}
                ${createChartCard('Site Pipeline Funnel', 'pipeline-funnel')}
                ${createChartCard('New Sites Trend', 'new-sites-line')}
            </div>
            ${createTableCard('Stuck Sites (No Progress)', ['Site ID', 'Site Name', 'Status', 'Reason'], operations.stuckSites.map(s => [s.id, s.name, `<span class="badge badge-warning">${s.status}</span>`, s.reason]))}
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">1.6 Exceptions</h2>
            <div class="stats-grid">
                ${createStatCard('ARC Expiring Soon', exceptions.arcExpiring.length, 'alert-triangle', 'red')}
            </div>
            <div class="charts-grid">
                ${createTableCard('Leave Beyond SLA', ['Request ID', 'Employee', 'Delayed By'], exceptions.leaveBeyondSLA.map(l => [l.id, l.employee, l.delayedBy]))}
                ${createTableCard('Expense Beyond SLA', ['Request ID', 'Employee', 'Delayed By'], exceptions.expenseBeyondSLA.map(e => [e.id, e.employee, e.delayedBy]))}
            </div>
            ${createTableCard('ARC Expiring Soon Alerts', ['Customer', 'Expiry Date', 'Value'], exceptions.arcExpiring.map(a => [a.customer, a.expiry, a.value]))}
        </div>
    `;

    renderAdminCharts(approvals, hr, expenses, operations);
}

function renderAdminCharts(approvals, hr, expenses, operations) {
    new ApexCharts(document.querySelector("#leave-time-chart"), {
        series: [{ data: approvals.leaveAging.map(a => a.count) }],
        chart: { type: 'bar', height: 250, toolbar: { show: false } },
        xaxis: { categories: approvals.leaveAging.map(a => a.age) },
        colors: ['#7367f0']
    }).render();

    new ApexCharts(document.querySelector("#expense-stage-chart"), {
        series: approvals.expenseStages.map(s => s.count),
        labels: approvals.expenseStages.map(s => s.stage),
        chart: { type: 'donut', height: 250 },
        colors: ['#ff9f43', '#00cfe8', '#28c76f', '#7367f0']
    }).render();

    new ApexCharts(document.querySelector("#turnaround-chart"), {
        series: [{ name: 'Days', data: approvals.turnaroundTrend }],
        chart: { type: 'line', height: 250 },
        stroke: { curve: 'smooth' },
        colors: ['#ea5455']
    }).render();

    new ApexCharts(document.querySelector("#attendance-donut"), {
        series: [hr.attendanceToday.present, hr.attendanceToday.absent],
        labels: ['Present', 'Absent'],
        chart: { type: 'donut', height: 250 },
        colors: ['#28c76f', '#ea5455']
    }).render();

    new ApexCharts(document.querySelector("#leave-status-donut"), {
        series: hr.leaveDistribution.map(l => l.count),
        labels: hr.leaveDistribution.map(l => l.status),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#attendance-line"), {
        series: [{ name: 'Present', data: hr.attendanceTrend.map(t => t.present) }],
        chart: { type: 'area', height: 250 },
        colors: ['#28c76f']
    }).render();

    new ApexCharts(document.querySelector("#role-bar"), {
        series: [{ data: hr.roleDistribution.map(r => r.count) }],
        chart: { type: 'bar', height: 250 },
        xaxis: { categories: hr.roleDistribution.map(r => r._id) },
        colors: ['#00cfe8']
    }).render();

    new ApexCharts(document.querySelector("#expense-status-donut"), {
        series: expenses.statusDistribution.map(s => s.count),
        labels: expenses.statusDistribution.map(s => s._id),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#expense-trend-line"), {
        series: [{ name: 'Expense', data: expenses.dailyTrend }],
        chart: { type: 'line', height: 250 },
        colors: ['#28c76f']
    }).render();

    new ApexCharts(document.querySelector("#pipeline-funnel"), {
        series: [{ name: 'Sites', data: operations.pipeline.map(p => p.count) }],
        chart: { type: 'bar', height: 250 },
        plotOptions: { bar: { horizontal: true, funnel: true } },
        xaxis: { categories: operations.pipeline.map(p => p.stage) }
    }).render();

    new ApexCharts(document.querySelector("#new-sites-line"), {
        series: [{ name: 'New Sites', data: operations.newSitesTrend }],
        chart: { type: 'line', height: 250 },
        colors: ['#ff9f43']
    }).render();

    new ApexCharts(document.querySelector("#sites-status-donut"), {
        series: operations.sitesByStatus.map(s => s.count),
        labels: operations.sitesByStatus.map(s => s._id),
        chart: { type: 'donut', height: 250 }
    }).render();
}

// --- MANAGER DASHBOARD ---
function renderManager() {
    const { teamKpis, approvals, teamHr, expenseTracking, siteTracking } = state.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="dashboard-section">
            <h2 class="section-title">2.1 Team KPIs</h2>
            <div class="stats-grid">
                ${createStatCard('Pending Leave', teamKpis.pendingLeaves, 'mail', 'navy')}
                ${createStatCard('Pending Expense', teamKpis.pendingExpenses, 'credit-card', 'green')}
                ${createStatCard('Employees on Leave Today', teamKpis.onLeaveToday, 'users', 'orange')}
                ${createStatCard('Employees Absent Today', teamKpis.absentToday, 'users', 'red')}
            </div>
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">2.2 Approval Monitoring</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Leave Pending by Time', 'mgr-leave-time')}
                ${createChartCard('Expense Pending by Stage', 'mgr-expense-stage')}
            </div>
            ${createTableCard('Stale Requests', ['ID', 'Type', 'Employee', 'Days'], approvals.staleRequests.map(r => [r.id, r.type, r.employee, r.daysStale]))}
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">2.3 Team HR Insights</h2>
            <div class="charts-grid">
                ${createChartCard('Attendance Today', 'mgr-attendance-donut')}
                ${createChartCard('Leave by Status', 'mgr-leave-donut')}
            </div>
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">2.4 Expense Tracking</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Expense Status Split', 'mgr-expense-donut')}
            </div>
            ${createTableCard('Top Expense Claims', ['Name', 'Amount', 'Employee'], expenseTracking.topClaims.map(c => [c.name, '₹' + c.amount, c.employee]))}
        </div>

        <div class="dashboard-section">
            <h2 class="section-title">2.5 Site Tracking</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Sites by Status', 'mgr-sites-donut')}
            </div>
            ${createTableCard('Stuck Sites', ['ID', 'Name', 'Reason'], siteTracking.stuckSites.map(s => [s.id, s.name, s.reason]))}
        </div>
    `;

    new ApexCharts(document.querySelector("#mgr-leave-time"), {
        series: [{ data: approvals.leaveAging.map(a => a.count) }],
        chart: { type: 'bar', height: 250 },
        xaxis: { categories: approvals.leaveAging.map(a => a.age) }
    }).render();

    new ApexCharts(document.querySelector("#mgr-expense-stage"), {
        series: approvals.expenseStages.map(s => s.count),
        labels: approvals.expenseStages.map(s => s.stage),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#mgr-attendance-donut"), {
        series: [teamHr.attendanceToday.present, teamHr.attendanceToday.absent],
        labels: ['Present', 'Absent'],
        chart: { type: 'donut', height: 250 },
        colors: ['#28c76f', '#ea5455']
    }).render();

    new ApexCharts(document.querySelector("#mgr-leave-donut"), {
        series: teamHr.leaveStatus.map(l => l.count),
        labels: teamHr.leaveStatus.map(l => l.status),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#mgr-expense-donut"), {
        series: expenseTracking.statusSplit.map(s => s.count),
        labels: expenseTracking.statusSplit.map(s => s.status),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#mgr-sites-donut"), {
        series: siteTracking.sitesByStatus.map(s => s.count),
        labels: siteTracking.sitesByStatus.map(s => s._id),
        chart: { type: 'donut', height: 250 }
    }).render();
}

// --- HR DASHBOARD ---
function renderHR() {
    const { workforceKpis, monitoring } = state.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="dashboard-section">
            <h2 class="section-title">3.1 Workforce KPIs</h2>
            <div class="stats-grid">
                ${createStatCard('Total Employees', workforceKpis.totalEmployees, 'users', 'cyan')}
            </div>
            <div class="charts-grid">
                ${createChartCard('Attendance Today', 'hr-attendance-donut')}
                ${createChartCard('Leave Distribution', 'hr-leave-donut')}
            </div>
        </div>
        <div class="dashboard-section">
            <h2 class="section-title">3.2 Attendance & Leave Monitoring</h2>
            <div class="charts-grid">
                ${createChartCard('Daily Attendance Trend', 'hr-attendance-line')}
                ${createChartCard('Leave Pending by Time', 'hr-leave-age-bar')}
                ${createChartCard('Employees by Role', 'hr-role-bar')}
            </div>
        </div>
    `;

    new ApexCharts(document.querySelector("#hr-attendance-donut"), {
        series: [workforceKpis.attendanceToday.present, workforceKpis.attendanceToday.absent],
        labels: ['Present', 'Absent'],
        chart: { type: 'donut', height: 250 },
        colors: ['#28c76f', '#ea5455']
    }).render();

    new ApexCharts(document.querySelector("#hr-leave-donut"), {
        series: workforceKpis.leaveStatus.map(l => l.count),
        labels: workforceKpis.leaveStatus.map(l => l.status),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#hr-attendance-line"), {
        series: [{ name: 'Present', data: monitoring.attendanceTrend.map(t => t.present) }],
        chart: { type: 'area', height: 250 },
        colors: ['#28c76f']
    }).render();

    new ApexCharts(document.querySelector("#hr-leave-age-bar"), {
        series: [{ data: monitoring.leaveAging.map(a => a.count) }],
        chart: { type: 'bar', height: 250 },
        xaxis: { categories: monitoring.leaveAging.map(a => a.age) }
    }).render();

    new ApexCharts(document.querySelector("#hr-role-bar"), {
        series: [{ data: monitoring.roleDistribution.map(r => r.count) }],
        chart: { type: 'bar', height: 250 },
        xaxis: { categories: monitoring.roleDistribution.map(r => r._id) }
    }).render();
}

// --- ACCOUNTANT DASHBOARD ---
function renderAccountant() {
    const { expenseKpis, monitoring } = state.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="dashboard-section">
            <h2 class="section-title">4.1 Expense KPIs</h2>
            <div class="stats-grid">
                ${createStatCard('Pending Expense', expenseKpis.pendingApproval, 'credit-card', 'navy')}
                ${createStatCard('Monthly Total', '₹' + expenseKpis.monthlyTotal.toLocaleString(), 'trending-up', 'green')}
            </div>
        </div>
        <div class="dashboard-section">
            <h2 class="section-title">4.2 Expense Monitoring</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Expense by Status', 'acc-status-donut')}
                ${createChartCard('Daily Expense Trend', 'acc-trend-line')}
                ${createChartCard('Pending Claims Aging', 'acc-age-bar')}
            </div>
            ${createTableCard('Top Expense Claims', ['Name', 'Amount', 'Employee'], monitoring.topClaims.map(c => [c.name, '₹' + c.amount, c.employee]))}
        </div>
    `;

    new ApexCharts(document.querySelector("#acc-status-donut"), {
        series: monitoring.statusDistribution.map(s => s.count),
        labels: monitoring.statusDistribution.map(s => s._id),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#acc-trend-line"), {
        series: [{ name: 'Expense', data: monitoring.trend }],
        chart: { type: 'line', height: 250 },
        colors: ['#28c76f']
    }).render();

    new ApexCharts(document.querySelector("#acc-age-bar"), {
        series: [{ data: monitoring.aging.map(a => a.count) }],
        chart: { type: 'bar', height: 250 },
        xaxis: { categories: monitoring.aging.map(a => a.age) }
    }).render();
}

// --- EMPLOYEE DASHBOARD ---
function renderEmployee() {
    const { personalKpis, tracking } = state.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <div class="dashboard-section">
            <h2 class="section-title">5.1 Personal KPIs</h2>
            <div class="stats-grid">
                ${createStatCard('Attendance Status Today', personalKpis.attendanceToday, 'activity', 'green')}
                ${createStatCard('Leave Status', personalKpis.leaveStatus, 'mail', 'navy')}
                ${createStatCard('Expense Status', personalKpis.expenseStatus, 'credit-card', 'orange')}
            </div>
        </div>
        <div class="dashboard-section">
            <h2 class="section-title">5.2 Personal Tracking</h2>
            <div class="charts-grid" style="margin-bottom: 24px;">
                ${createChartCard('Leave by Status', 'emp-leave-donut')}
                ${createChartCard('Expense by Status', 'emp-expense-donut')}
            </div>
            ${createTableCard('Recent Expense Submissions', ['ID', 'Date', 'Amount', 'Status'], tracking.recentExpenses.map(e => [e.id, e.date, '₹' + e.amount, e.status]))}
        </div>
    `;

    new ApexCharts(document.querySelector("#emp-leave-donut"), {
        series: tracking.leaves.map(l => l.count),
        labels: tracking.leaves.map(l => l.status),
        chart: { type: 'donut', height: 250 }
    }).render();

    new ApexCharts(document.querySelector("#emp-expense-donut"), {
        series: tracking.expenses.map(e => e.count),
        labels: tracking.expenses.map(e => e.status),
        chart: { type: 'donut', height: 250 },
        colors: ['#28c76f', '#ff9f43', '#ea5455']
    }).render();
}

// Navigation Helper
window.switchRole = (role) => {
    state.currentRole = role;
    const newPath = `/${role}`;
    window.history.pushState({}, '', newPath);
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if(item.dataset.role === role) item.classList.add('active');
    });

    fetchDashboardData();
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const role = item.dataset.role;
        if (role) window.switchRole(role);
    });
});

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    initIcons();
    handleRouting();
});

window.addEventListener('popstate', handleRouting);
