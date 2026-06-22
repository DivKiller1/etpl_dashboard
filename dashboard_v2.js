// ── SECTION 1: CONSTANTS (holidays array only)
const COMPANY_HOLIDAYS = [
    { name: "New Year", date: "2026-01-01", location: "all" },
    { name: "Republic Day", date: "2026-01-26", location: "all" },
    { name: "Holi", date: "2026-03-04", location: "all" },
    { name: "Rang Panchami", date: "2026-03-08", location: "indore" },
    { name: "Good Friday", date: "2026-04-03", location: "all" },
    { name: "Buddha Purnima/Labour Day", date: "2026-05-01", location: "indore" },
    { name: "Independence Day", date: "2026-08-15", location: "all" },
    { name: "Rakshabandhan", date: "2026-08-28", location: "all" },
    { name: "Ganesh Chaturthi", date: "2026-09-14", location: "gurgaon" },
    { name: "Gandhi Jayanti", date: "2026-10-02", location: "all" },
    { name: "Dussehra", date: "2026-10-20", location: "all" },
    { name: "Diwali", date: "2026-11-08", location: "all" },
    { name: "Govardhan Pooja", date: "2026-11-09", location: "all" },
    { name: "Christmas Day", date: "2026-12-25", location: "all" }
];

// Employee Location Registry for city-specific holiday rules
const EMPLOYEE_LOCATIONS = {
    "Ramesh singh": "indore",
    "Jitendra Kumar": "gurgaon",
    "Anoop Sharma": "indore",
    "Sandeep Yadav": "gurgaon",
    "Vikas Gupta": "indore",
    "Priya Patel": "gurgaon",
    "Rahul Verma": "indore",
    "Neha Singh": "gurgaon",
    "Amit Mishra": "indore",
    "Sanjay Dutt": "mumbai"
};

// State and Database Variables
let rawApiData = null;
let dailyAttendanceDb = []; // Array of { employeeName, date, status }
let dailyExpensesDb = [];    // Array of { customerName, date, site, category, amount }
let leaveTransactions = [];  // Array of { employeeName, startDate, endDate, duration, type }
let dailyLocationAttendances = []; // Array of { employeeName, role, date, siteId, siteName, customerName }
let employeeMap = {}; // Lookup map of employee details keyed by employee name

// Helper to determine the primary work MODE of an employee based on designation and base location
function getEmployeePrimaryMode(empDetails) {
    if (!empDetails) return 'On-Field';
    const des = (empDetails.designation || '').toLowerCase();
    const loc = (empDetails.baseLocation || '').toLowerCase();

    if (des.includes('site') || des.includes('engineer') || des.includes('technician')) {
        return 'On-Field';
    }
    if (loc.includes('gurgaon') || des.includes('strategy') || des.includes('hr') || des.includes('trainee') || des.includes('head')) {
        return 'Strategy Office';
    }
    return 'Head Office';
}

// Chart References
let chartAttendanceTrends = null;
let chartLeaveDistribution = null;
let chartCustomerExpenses = null;
let chartCustomerSite = null;
let chartExpenseTypes = null;
let chartWorkforceDistribution = null;
let chartWorkforceShare = null;

// ── SECTION 2: FILTER STATE & REACTIVE UPDATER
const filterState = {
    month: '2026-06',
    dateFrom: null,
    dateTo: null
};

// Utility to parse week start date (Monday) from ISO week numbers
function getMondayOfISOWeek(w, y) {
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = new Date(simple);
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    return ISOweekStart;
}

// Utility to format date to YYYY-MM-DD
function formatDateStr(date) {
    const d = new Date(date);
    if (isNaN(d)) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Map employee name to a location
function getEmployeeLocation(name) {
    const empDetails = employeeMap[name];
    if (empDetails && empDetails.baseLocation) {
        const loc = empDetails.baseLocation.trim().toLowerCase();
        if (loc.includes('indore')) return 'indore';
        if (loc.includes('gurgaon') || loc.includes('gurgoun') || loc.includes('gurugram')) return 'gurgaon';
        return loc;
    }
    if (EMPLOYEE_LOCATIONS[name]) return EMPLOYEE_LOCATIONS[name];
    return name.charCodeAt(0) % 2 === 0 ? "indore" : "gurgaon";
}

function normalizeClientExpenseCategory(type) {
    if (!type) return 'Other';
    const t = type.trim().toLowerCase();
    if (t === 'ta' || t.includes('travel') || t.includes('transport')) return 'TA';
    if (t === 'da' || t.includes('daily allow') || t.includes('dearness')) return 'DA';
    if (t.includes('hotel') || t.includes('lodge') || t.includes('accommodat')) return 'Hotel';
    return 'Other';
}

// Process the raw API response and reconstruct a clean client daily database
function processRawApiData(data) {
    dailyAttendanceDb = [];
    dailyExpensesDb = [];
    leaveTransactions = [];
    dailyLocationAttendances = [];

    // Build lookup map for employee extra details
    employeeMap = {};
    if (data && data.employees) {
        data.employees.forEach(emp => {
            employeeMap[emp.fullName] = emp;
        });
    }

    const { detailedAttendance, customerExpenses, dailyAttendances } = data;
    if (dailyAttendances) {
        dailyLocationAttendances = dailyAttendances;
    }

    // 1. Reconstruct Daily Attendance (Sundays/Holidays override and bypass database state)
    if (detailedAttendance) {
        Object.keys(detailedAttendance).forEach(weekKey => {
            const parts = weekKey.split('-');
            const weekNum = parseInt(parts[0].replace('W', ''));
            const year = parseInt(parts[1]);

            if (isNaN(weekNum) || isNaN(year)) return;
            const startMonday = getMondayOfISOWeek(weekNum, year);

            const dayOffset = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

            detailedAttendance[weekKey].forEach(emp => {
                const dailyStatus = emp.dailyStatus || {};
                const employeeLoc = getEmployeeLocation(emp.name);

                Object.keys(dailyStatus).forEach(dayIndex => {
                    const offset = dayOffset[dayIndex];
                    if (offset === undefined) return;

                    const currentDate = new Date(startMonday);
                    currentDate.setDate(startMonday.getDate() + offset);
                    const dateStr = formatDateStr(currentDate);

                    const isSunday = currentDate.getDay() === 0;
                    const isHoliday = COMPANY_HOLIDAYS.some(holiday => {
                        if (holiday.date !== dateStr) return false;
                        return holiday.location === 'all' || holiday.location === employeeLoc;
                    });

                    let status;
                    // Strict Rule: If it's a Sunday or Holiday, bypass standard Present/Absent status and mark as Holiday
                    if (isSunday || isHoliday) {
                        status = 'Holiday';
                    } else {
                        status = dailyStatus[dayIndex] || 'Absent';
                        if (status === 'On Leave') status = 'Leave';
                    }

                    dailyAttendanceDb.push({
                        employeeName: emp.name,
                        date: dateStr,
                        status: status
                    });
                });
            });
        });
    }

    // 2. Real Approved leave records from API
    if (data.approvedLeaves) {
        leaveTransactions = data.approvedLeaves;
    }

    // 3. Real Paid expense records from API (normalize category to match chart expectations)
    if (data.paidExpenses) {
        dailyExpensesDb = data.paidExpenses.map(e => ({
            customerName: e.customerName,
            customerId:   e.customerId,
            date:         e.date,
            site:         e.siteName || 'Office',
            category:     normalizeClientExpenseCategory(e.category),
            amount:       e.amount || 0
        }));
    }
}

// Populates expense/leave charts in Director Dashboard using already-loaded rawApiData
function fetchCoreDashboardData() {
    if (rawApiData) updateFilters();
}

// Core reactive update handler on any filter input change
function updateFilters() {
    if (!rawApiData) return;

    // Get input values
    const monthVal = document.getElementById('month-select').value;
    const fromVal = document.getElementById('date-from').value;
    const toVal = document.getElementById('date-to').value;
    const scaleVal = document.getElementById('attendance-scale-select')?.value || 'daily';

    filterState.month = monthVal;
    filterState.dateFrom = fromVal ? fromVal : null;
    filterState.dateTo = toVal ? toVal : null;

    // Filter dynamic datasets based on the unified filter state
    const filteredAttendance = filterAttendanceDb();
    const filteredExpenses = filterExpensesDb();
    const filteredLeaves = filterLeavesDb();

    // Re-render UI components & update ApexCharts
    renderAttendanceTrends(filteredAttendance, scaleVal);
    renderLeaveDistribution(filteredLeaves);
    renderCustomerExpenses(filteredExpenses);
    renderCustomerSelectDropdown(filteredExpenses);
    renderCustomerBreakdowns(filteredExpenses);
}

// Filter core attendance list
function filterAttendanceDb() {
    return dailyAttendanceDb.filter(record => {
        const d = record.date;
        if (filterState.dateFrom && d < filterState.dateFrom) return false;
        if (filterState.dateTo && d > filterState.dateTo) return false;
        if (!filterState.dateFrom && !filterState.dateTo && filterState.month !== 'all') {
            if (!d.startsWith(filterState.month)) return false;
        }
        return true;
    });
}

// Filter core expenses list
function filterExpensesDb() {
    return dailyExpensesDb.filter(record => {
        const d = record.date;
        if (filterState.dateFrom && d < filterState.dateFrom) return false;
        if (filterState.dateTo && d > filterState.dateTo) return false;
        if (!filterState.dateFrom && !filterState.dateTo && filterState.month !== 'all') {
            if (!d.startsWith(filterState.month)) return false;
        }
        return true;
    });
}

// Filter core leaves list
function filterLeavesDb() {
    return leaveTransactions.filter(record => {
        const start = record.startDate;
        if (filterState.dateFrom && start < filterState.dateFrom) return false;
        if (filterState.dateTo && start > filterState.dateTo) return false;
        if (!filterState.dateFrom && !filterState.dateTo && filterState.month !== 'all') {
            if (!start.startsWith(filterState.month)) return false;
        }
        return true;
    });
}

// Helper to get ISO week number in standard format
function getISOWeekCode(dateStr) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `W${weekNo}-${d.getFullYear()}`;
}

// ── SECTION 3: CHART RENDERERS

// Render Chart 1: Grouped Bar Chart of Attendance & Leave Trends with Daily, Weekly, and Monthly Scales
function renderAttendanceTrends(attendanceData, scale) {
    const presentSeries = [];
    const leaveSeries = [];
    const absentSeries = [];
    let categoriesList = [];

    if (scale === 'weekly') {
        // Group by ISO weeks present in the filtered records
        const weekGroups = {};
        attendanceData.forEach(r => {
            const weekKey = getISOWeekCode(r.date);
            if (!weekGroups[weekKey]) weekGroups[weekKey] = [];
            weekGroups[weekKey].push(r);
        });

        // Sort weeks chronologically
        const sortedWeeks = Object.keys(weekGroups).sort();
        sortedWeeks.forEach(w => {
            const records = weekGroups[w];
            // Only aggregate actual working records (ignore Holidays/Sundays)
            const working = records.filter(r => r.status !== 'Holiday');
            const total = working.length;
            if (total === 0) return; // omit empty weeks from trends

            const present = working.filter(r => r.status === 'Present').length;
            const leave = working.filter(r => r.status === 'Leave').length;
            const absent = working.filter(r => r.status === 'Absent').length;

            presentSeries.push(parseFloat(((present / total) * 100).toFixed(1)));
            leaveSeries.push(parseFloat(((leave / total) * 100).toFixed(1)));
            absentSeries.push(parseFloat(((absent / total) * 100).toFixed(1)));

            // Extract ranges matching the week
            const trend = rawApiData?.weeklyTrends?.find(t => t.week === w);
            const label = trend ? `${w} (${trend.range})` : w;
            categoriesList.push(label);
        });

    } else if (scale === 'monthly') {
        // Group by month keys
        const monthGroups = {};
        attendanceData.forEach(r => {
            const mKey = r.date.substring(0, 7); // e.g. "2026-06"
            if (!monthGroups[mKey]) monthGroups[mKey] = [];
            monthGroups[mKey].push(r);
        });

        const sortedMonths = Object.keys(monthGroups).sort();
        const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        sortedMonths.forEach(m => {
            const records = monthGroups[m];
            const working = records.filter(r => r.status !== 'Holiday');
            const total = working.length;
            if (total === 0) return;

            const present = working.filter(r => r.status === 'Present').length;
            const leave = working.filter(r => r.status === 'Leave').length;
            const absent = working.filter(r => r.status === 'Absent').length;

            presentSeries.push(parseFloat(((present / total) * 100).toFixed(1)));
            leaveSeries.push(parseFloat(((leave / total) * 100).toFixed(1)));
            absentSeries.push(parseFloat(((absent / total) * 100).toFixed(1)));

            const parts = m.split('-');
            categoriesList.push(`${monthsNames[parseInt(parts[1]) - 1]} ${parts[0]}`);
        });

    } else {
        // Default scale: Daily
        const dates = [...new Set(attendanceData.map(r => r.date))].sort();
        dates.forEach(d => {
            const records = attendanceData.filter(r => r.date === d);
            const working = records.filter(r => r.status !== 'Holiday'); // Omit Sundays and holidays to show work day averages
            const total = working.length;
            if (total === 0) return; // skip holidays and sundays to avoid drops to 0%

            const present = working.filter(r => r.status === 'Present').length;
            const leave = working.filter(r => r.status === 'Leave').length;
            const absent = working.filter(r => r.status === 'Absent').length;

            presentSeries.push(parseFloat(((present / total) * 100).toFixed(1)));
            leaveSeries.push(parseFloat(((leave / total) * 100).toFixed(1)));
            absentSeries.push(parseFloat(((absent / total) * 100).toFixed(1)));

            const dateObj = new Date(d);
            categoriesList.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        });
    }

    const chartWidth = Math.max(800, categoriesList.length * 80);

    const options = {
        series: [
            { name: 'Avg. Staff Present (%)', data: presentSeries },
            { name: 'Employees on Leave (%)', data: leaveSeries },
            { name: 'Employees Absent (%)', data: absentSeries }
        ],
        chart: {
            type: 'bar',
            height: 350,
            width: chartWidth,
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '60%',
                borderRadius: 4,
                dataLabels: { position: 'top' }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val) => val > 0 ? val + '%' : '',
            style: { fontSize: '10px', colors: ['#374151'] },
            offsetY: -15
        },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: {
            categories: categoriesList,
            labels: { style: { fontSize: '11px', fontWeight: 500 } }
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: { formatter: (val) => val + '%' }
        },
        colors: ['#6366f1', '#3b82f6', '#ef4444'],
        tooltip: {
            shared: true,
            intersect: false,
            y: { formatter: (val) => val + '%' }
        },
        legend: { position: 'top', horizontalAlign: 'left' }
    };

    if (chartAttendanceTrends) chartAttendanceTrends.destroy();

    if (categoriesList.length === 0) {
        document.querySelector("#attendance-trends-chart").innerHTML = '<div style="padding: 100px; text-align: center; color: #888;">No attendance data found in the selected range</div>';
        return;
    }

    document.querySelector("#attendance-trends-chart").innerHTML = '';
    chartAttendanceTrends = new ApexCharts(document.querySelector("#attendance-trends-chart"), options);
    chartAttendanceTrends.render();
}

// Render Chart 2: Leave Distribution Pie/Donut Chart
function renderLeaveDistribution(leaveData) {
    const el = document.querySelector('#leave-distribution-chart');
    if (!el) return;
    const leaveCounts = {};
    leaveData.forEach(l => {
        const t = (l.type || 'Other').trim();
        leaveCounts[t] = (leaveCounts[t] || 0) + (l.duration || 1);
    });

    const rawLabels = Object.keys(leaveCounts);
    const labels = rawLabels.map(k => {
        const abbr = { 'Casual Leave':'CL','Earned Leave':'EL','Earned Leaves':'EL','Loss of Pay':'LOP','Sick Leave':'SL','Bereavement Leave':'BL' };
        return abbr[k] || k;
    });
    const series = rawLabels.map(k => leaveCounts[k]);

    const colors = ['#ef4444','#f59e0b','#6366f1','#10b981','#3b82f6','#a78bfa','#f43f5e','#06b6d4'];

    const options = {
        series,
        labels,
        chart: {
            type: 'donut',
            height: 220,
            events: {
                dataPointSelection: (e, ctx, config) => {
                    openLeaveModal(labels[config.dataPointIndex]);
                }
            }
        },
        colors: colors.slice(0, labels.length),
        tooltip: { y: { formatter: (val) => `${val} Days` } },
        legend: { position: 'right', fontSize: '11px', offsetY: 0 },
        plotOptions: { pie: { donut: { size: '55%' } } },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        }
    };

    if (chartLeaveDistribution) chartLeaveDistribution.destroy();

    if (series.length === 0 || series.every(v => v === 0)) {
        el.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No leave records</div>';
        return;
    }

    el.innerHTML = '';
    chartLeaveDistribution = new ApexCharts(el, options);
    chartLeaveDistribution.render();
}

// Render Chart 3: Grouped Vertical Bar Chart of Customer Expenses
function renderCustomerExpenses(expenseData) {
    const customers = [...new Set(expenseData.map(r => r.customerName))];
    const categories = ["TA", "DA", "Hotel", "Other"];

    const seriesData = categories.map(cat => {
        return {
            name: cat,
            data: customers.map(cust => {
                return expenseData
                    .filter(r => r.customerName === cust && (cat === 'Other' ? !["TA", "DA", "Hotel"].includes(r.category) : r.category === cat))
                    .reduce((sum, r) => sum + r.amount, 0);
            })
        };
    });

    const options = {
        series: seriesData,
        chart: {
            type: 'bar',
            height: 200,
            stacked: true,
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '35%',
                borderRadius: 3
            }
        },
        xaxis: {
            categories: customers,
            labels: {
                rotate: -45,
                style: { fontSize: '11px', fontWeight: 500 }
            }
        },
        yaxis: {
            labels: { formatter: (val) => '₹' + val.toLocaleString('en-IN') }
        },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6'],
        tooltip: {
            y: { formatter: (val) => '₹' + val.toLocaleString('en-IN') }
        },
        legend: { position: 'top', horizontalAlign: 'left' }
    };

    const expEl = document.querySelector('#customer-expenses-chart');
    if (!expEl) return;
    if (chartCustomerExpenses) chartCustomerExpenses.destroy();

    if (customers.length === 0) {
        expEl.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No expense data in selected range</div>';
        return;
    }

    expEl.innerHTML = '';
    chartCustomerExpenses = new ApexCharts(expEl, options);
    chartCustomerExpenses.render();
}

// Helper to populate the customer filter select dropdown dynamically
function renderCustomerSelectDropdown(expenseData) {
    const dropdown = document.getElementById('customer-select');
    if (!dropdown) return;

    const customers = [...new Set(expenseData.map(r => r.customerName))].sort();
    const prevSelection = dropdown.value;

    dropdown.innerHTML = '';
    customers.forEach(cust => {
        const opt = document.createElement('option');
        opt.value = cust;
        opt.textContent = cust;
        if (cust === prevSelection) opt.selected = true;
        dropdown.appendChild(opt);
    });

    if (customers.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'none';
        opt.textContent = 'No Customers';
        dropdown.appendChild(opt);
    }
}

// Render dynamic linked pie charts for Customer Site Breakdown & Expense Types
function renderCustomerBreakdowns(expenseData) {
    const selectedCust = document.getElementById('customer-select')?.value;
    if (!selectedCust || selectedCust === 'none') {
        renderEmptyCustomerBreakdownCharts();
        return;
    }

    const custExpenses = expenseData.filter(r => r.customerName === selectedCust);

    // 1. Site Breakdown Pie Chart
    const siteTotals = {};
    custExpenses.forEach(r => {
        siteTotals[r.site] = (siteTotals[r.site] || 0) + r.amount;
    });
    const siteSeries = Object.values(siteTotals);
    const siteLabels = Object.keys(siteTotals);

    const siteOptions = {
        series: siteSeries,
        labels: siteLabels,
        chart: { type: 'pie', height: 200 },
        legend: { position: 'right', fontSize: '11px' },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        },
        tooltip: { y: { formatter: (val) => '₹' + val.toLocaleString('en-IN') } },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6']
    };

    const siteEl = document.querySelector('#customer-site-chart');
    if (chartCustomerSite) chartCustomerSite.destroy();
    if (siteEl) {
        if (siteSeries.length > 0) {
            siteEl.innerHTML = '';
            chartCustomerSite = new ApexCharts(siteEl, siteOptions);
            chartCustomerSite.render();
        } else {
            siteEl.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No site data available</div>';
        }
    }

    // 2. Expense Category Types Breakdown Pie Chart
    const categoryTotals = { TA: 0, DA: 0, Hotel: 0, Other: 0 };
    custExpenses.forEach(r => {
        const norm = ["TA", "DA", "Hotel"].includes(r.category) ? r.category : 'Other';
        categoryTotals[norm] += r.amount;
    });
    const typeSeries = Object.values(categoryTotals);
    const typeLabels = Object.keys(categoryTotals);

    const typeOptions = {
        series: typeSeries,
        labels: typeLabels,
        chart: { type: 'pie', height: 200 },
        legend: { position: 'right', fontSize: '11px' },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        },
        tooltip: { y: { formatter: (val) => '₹' + val.toLocaleString('en-IN') } },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6']
    };

    const typeEl = document.querySelector('#expense-types-chart');
    if (chartExpenseTypes) chartExpenseTypes.destroy();
    if (typeEl) {
        if (typeSeries.some(v => v > 0)) {
            typeEl.innerHTML = '';
            chartExpenseTypes = new ApexCharts(typeEl, typeOptions);
            chartExpenseTypes.render();
        } else {
            typeEl.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No category data available</div>';
        }
    }
}

// Render empty placeholders for breakdowns
function renderEmptyCustomerBreakdownCharts() {
    if (chartCustomerSite) chartCustomerSite.destroy();
    if (chartExpenseTypes) chartExpenseTypes.destroy();
    const s = document.querySelector('#customer-site-chart');
    const t = document.querySelector('#expense-types-chart');
    if (s) s.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No data available</div>';
    if (t) t.innerHTML = '<div style="padding:60px; text-align:center; color:#888;">No data available</div>';
}

// Filter core workforce list based on the global filterState
function filterWorkforceDb() {
    return dailyLocationAttendances.filter(record => {
        const d = record.date;
        if (filterState.dateFrom && d < filterState.dateFrom) return false;
        if (filterState.dateTo && d > filterState.dateTo) return false;
        if (!filterState.dateFrom && !filterState.dateTo && filterState.month !== 'all') {
            if (!d.startsWith(filterState.month)) return false;
        }
        return true;
    });
}

// Filter and populate workforce dropdowns based on the full raw dailyLocationAttendances (decoupled from common filter)
function renderWorkforceDistribution(filteredData) {
    const monthDropdown = document.getElementById('dist-month-select');
    const dateDropdown = document.getElementById('dist-date-select');
    if (!monthDropdown || !dateDropdown) return;

    // Always use full unfiltered dailyLocationAttendances dataset to make it fully dedicated and independent
    const months = [...new Set(dailyLocationAttendances.map(r => r.date.substring(0, 7)))].sort();

    const prevMonthVal = monthDropdown.value;
    monthDropdown.innerHTML = '';

    const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    months.forEach(m => {
        const parts = m.split('-');
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `${monthsNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
        if (m === prevMonthVal) opt.selected = true;
        monthDropdown.appendChild(opt);
    });

    // Default to latest month if not set or invalid
    if (!monthDropdown.value && months.length > 0) {
        monthDropdown.value = months[months.length - 1];
    }

    // Update dates for this selected month
    updateWorkforceDateSelect();
}

// Update the Date dropdown based on the selected month
function updateWorkforceDateSelect() {
    const monthDropdown = document.getElementById('dist-month-select');
    const dateDropdown = document.getElementById('dist-date-select');
    if (!monthDropdown || !dateDropdown) return;


    const selectedMonth = monthDropdown.value;
    if (!selectedMonth) return;

    // Get dates in this month from the full independent dataset
    const datesInMonth = [...new Set(dailyLocationAttendances
        .filter(r => r.date.startsWith(selectedMonth))
        .map(r => r.date)
    )].sort();

    const prevDateVal = dateDropdown.value;
    dateDropdown.innerHTML = '';

    datesInMonth.forEach(d => {
        const dateObj = new Date(d);
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (d === prevDateVal) opt.selected = true;
        dateDropdown.appendChild(opt);
    });

    // Default to the latest date in the month
    if (!dateDropdown.value && datesInMonth.length > 0) {
        dateDropdown.value = datesInMonth[datesInMonth.length - 1];
    }

    // Render the breakdown, trend chart and location share pie chart for this selected date
    const selectedDate = dateDropdown.value;
    if (selectedDate) {
        renderWorkforceDistributionDetails(selectedDate);
        renderWorkforceDistributionChart(selectedDate);
    } else {
        document.getElementById('workforce-dist-table-body').innerHTML = '<tr><td colspan="2" style="text-align: center; color: #888;">No records available</td></tr>';
        if (chartWorkforceShare) chartWorkforceShare.destroy();
        document.querySelector("#workforce-share-chart").innerHTML = '<div style="padding: 50px; text-align: center; color: #888;">No share data</div>';
        if (chartWorkforceDistribution) chartWorkforceDistribution.destroy();
        document.querySelector("#workforce-distribution-chart").innerHTML = '<div style="padding: 50px; text-align: center; color: #888;">No trend data</div>';
    }
}

// Render site-wise workforce distribution line chart for selectedDate compared with previousDate (previous form)
function renderWorkforceDistributionChart(selectedDate) {
    const selectedRecords = dailyLocationAttendances.filter(r => r.date === selectedDate);

    // Get unique active sites on this day
    const activeSites = [...new Set(selectedRecords.map(r => r.siteName))].sort();

    // Calculate counts for each site
    const selectedCounts = activeSites.map(sName => {
        return selectedRecords.filter(r => r.siteName === sName).length;
    });

    const series = [
        {
            name: `Staff Present`,
            data: selectedCounts
        }
    ];

    const lineOptions = {
        series: series,
        chart: {
            type: 'line',
            height: 380,
            width: '100%', // 100% responsive width to prevent layout breaking or going outside the screen
            toolbar: { show: true },
            events: {
                markerClick: function (event, chartContext, { seriesIndex, dataPointIndex, config }) {
                    const siteName = config.xaxis.categories[dataPointIndex];
                    if (siteName && selectedDate) {
                        openWorkforceModal(siteName, selectedDate);
                    }
                }
            }
        },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        markers: {
            size: 4,
            strokeWidth: 2,
            hover: { size: 6 }
        },
        xaxis: {
            categories: activeSites, // Site names on the X-axis!
            labels: {
                rotate: -45,
                style: { fontSize: '11px', fontWeight: 500 }
            }
        },
        yaxis: {
            min: 0,
            forceNiceScale: true,
            labels: { formatter: (val) => Math.round(val) }
        },
        grid: {
            padding: {
                left: 15,
                right: 15,
                top: 0,
                bottom: 0
            }
        },
        colors: ['#6366f1'], // Premium Indigo line
        tooltip: {
            shared: false,
            intersect: true,
            y: { formatter: (val) => val + ' Present' }
        },
        legend: { show: false }
    };

    if (chartWorkforceDistribution) chartWorkforceDistribution.destroy();

    if (activeSites.length === 0) {
        document.querySelector("#workforce-distribution-chart").innerHTML = '<div style="padding: 100px; text-align: center; color: #888;">No workforce distribution records on this date</div>';
    } else {
        document.querySelector("#workforce-distribution-chart").innerHTML = '';
        chartWorkforceDistribution = new ApexCharts(document.querySelector("#workforce-distribution-chart"), lineOptions);
        chartWorkforceDistribution.render();
    }
}

// Render workforce site breakdown table and location share pie/donut chart for a specific date
function renderWorkforceDistributionDetails(selectedDate) {
    const dateRecords = dailyLocationAttendances.filter(r => r.date === selectedDate);

    // Group records by siteName
    const siteGroups = {};
    dateRecords.forEach(r => {
        if (!siteGroups[r.siteName]) {
            siteGroups[r.siteName] = {
                siteName: r.siteName,
                employees: []
            };
        }
        siteGroups[r.siteName].employees.push(r);
    });

    const siteGroupsList = Object.values(siteGroups).sort((a, b) => b.employees.length - a.employees.length);

    // Update breakdown details table
    const tableBody = document.getElementById('workforce-dist-table-body');
    if (tableBody) {
        tableBody.innerHTML = '';
        if (siteGroupsList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #888;">No attendance records on this date</td></tr>';
        } else {
            siteGroupsList.forEach(group => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = 'Click to view full drill-down details';
                tr.addEventListener('click', () => openWorkforceModal(group.siteName, selectedDate));

                tr.innerHTML = `
                    <td><strong>${group.siteName}</strong></td>
                    <td style="text-align: center;"><span class="badge-pill green">${group.employees.length}</span></td>
                `;
                tableBody.appendChild(tr);
            });
        }
    }

    // Update location share donut chart
    const series = siteGroupsList.map(g => g.employees.length);
    const labels = siteGroupsList.map(g => g.siteName);

    const donutOptions = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            height: 320,
            events: {
                dataPointSelection: function (event, chartContext, config) {
                    const selectedIndex = config.dataPointIndex;
                    const siteName = labels[selectedIndex];
                    if (siteName) {
                        openWorkforceModal(siteName, selectedDate);
                    }
                }
            }
        },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#9ca3af', '#ec4899', '#14b8a6'],
        tooltip: {
            y: { formatter: (val) => val + ' Employees present' }
        },
        legend: { position: 'bottom' },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        }
    };

    if (chartWorkforceShare) chartWorkforceShare.destroy();

    if (series.length === 0) {
        document.querySelector("#workforce-share-chart").innerHTML = '<div style="padding: 80px; text-align: center; color: #888;">No location share records</div>';
    } else {
        document.querySelector("#workforce-share-chart").innerHTML = '';
        chartWorkforceShare = new ApexCharts(document.querySelector("#workforce-share-chart"), donutOptions);
        chartWorkforceShare.render();
    }
}

// Open workforce details interactive drilldown modal
function openWorkforceModal(siteName, date) {
    const modal = document.getElementById('workforce-modal');
    const customerEl = document.getElementById('workforce-modal-customer');
    const siteEl = document.getElementById('workforce-modal-site');
    const tbody = document.getElementById('workforce-modal-table-body');
    const exportBtn = document.getElementById('workforce-modal-export-btn');

    if (!modal || !tbody) return;

    // Find matching records on that date & siteName
    const matchedRecords = dailyLocationAttendances.filter(r => r.date === date && r.siteName === siteName);

    const customerName = matchedRecords[0]?.customerName || 'ETPL';

    customerEl.textContent = customerName;
    siteEl.textContent = siteName;
    tbody.innerHTML = '';

    if (matchedRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #888;">No employee records found.</td></tr>';
    } else {
        matchedRecords.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${r.employeeName}</strong></td>
                <td><span class="badge-pill blue">${r.role}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Setup clean cloned export event listener to prevent stacked listeners
    const newExportBtn = exportBtn.cloneNode(true);
    exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
    newExportBtn.addEventListener('click', () => exportWorkforceDrilldown(siteName, date, matchedRecords));

    // Display SVG icons
    if (window.lucide) {
        window.lucide.createIcons({
            attrs: { style: 'width: 14px; height: 14px;' }
        });
    }

    modal.classList.add('active');
}

// Close workforce details drilldown modal
function closeWorkforceModal() {
    const modal = document.getElementById('workforce-modal');
    if (modal) modal.classList.remove('active');
}

// Export specific daily workforce drilldown to formatted Excel sheet
async function exportWorkforceDrilldown(siteName, date, records) {
    if (!records || records.length === 0) {
        alert("No records to export.");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Workforce Details');

    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'MODE', key: 'mode', width: 15 },
        { header: 'Reporting Manager', key: 'reportingManager', width: 25 },
        { header: 'Role / Designation', key: 'role', width: 25 },
        { header: 'Site Name', key: 'siteName', width: 30 },
        { header: 'Customer Name', key: 'customerName', width: 30 },
        { header: 'Date', key: 'date', width: 15 }
    ];

    records.forEach(r => {
        const empDetails = employeeMap[r.employeeName] || {};
        worksheet.addRow({
            employeeId: empDetails.employeeId || 'N/A',
            employeeName: r.employeeName,
            mode: getEmployeePrimaryMode(empDetails),
            reportingManager: empDetails.managerName || 'N/A',
            role: r.role,
            siteName: r.siteName,
            customerName: r.customerName,
            date: formatDateToCustomStr(r.date)
        });
    });

    // Color header and format table
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6366F1' } // Purple header background
    };
    headerRow.alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.eachRow(row => {
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
        });
    });

    const filename = `Workforce_${siteName.replace(/\s+/g, '_')}_${date.replace(/-/g, '')}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// ── SECTION 4: EXPORT FUNCTIONS

// Export raw attendance records. Layout: Employee Name on left, Dates horizontally on top (Same structure, unstyled)
async function exportRawAttendance() {
    const attendanceData = filterAttendanceDb();
    if (attendanceData.length === 0) {
        alert("No attendance records to export in the selected range.");
        return;
    }

    const datesInPeriod = [...new Set(attendanceData.map(r => r.date))].sort();
    if (datesInPeriod.length === 0) return;

    const employees = [...new Set(dailyAttendanceDb.map(r => r.employeeName))].sort();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Raw Attendance');

    // 1. Setup column headers
    const columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'MODE', key: 'mode', width: 15 },
        { header: 'Reporting Manager', key: 'reportingManager', width: 25 }
    ];

    datesInPeriod.forEach(d => {
        columns.push({ header: d, key: d, width: 12 });
    });

    columns.push({ header: 'Total Working Days', key: 'totalWorking', width: 18 });
    columns.push({ header: 'Total Present', key: 'totalPresent', width: 15 });
    columns.push({ header: 'Total Absent', key: 'totalAbsent', width: 15 });

    worksheet.columns = columns;

    // 2. Populate rows for each employee (simple values, no styles)
    employees.forEach(emp => {
        const empDetails = employeeMap[emp] || {};
        const rowValues = {
            employeeId: empDetails.employeeId || 'N/A',
            employeeName: emp,
            mode: getEmployeePrimaryMode(empDetails),
            reportingManager: empDetails.managerName || 'N/A'
        };
        let workingDaysCount = 0;
        let presentDaysCount = 0;
        let absentDaysCount = 0;

        const employeeLoc = getEmployeeLocation(emp);

        datesInPeriod.forEach(d => {
            const dateObj = new Date(d);
            const isSunday = dateObj.getDay() === 0;

            const isHoliday = COMPANY_HOLIDAYS.some(holiday => {
                if (holiday.date !== d) return false;
                return holiday.location === 'all' || holiday.location === employeeLoc;
            });

            // Sunday and Holidays are both marked as H, bypassing database records
            if (isSunday || isHoliday) {
                rowValues[d] = 'H';
            } else {
                workingDaysCount++;
                const record = attendanceData.find(r => r.employeeName === emp && r.date === d);
                if (record && record.status === 'Present') {
                    rowValues[d] = 'P';
                    presentDaysCount++;
                } else if (record && record.status === 'Leave') {
                    rowValues[d] = 'L';
                } else {
                    rowValues[d] = 'A';
                    absentDaysCount++;
                }
            }
        });

        rowValues['totalWorking'] = workingDaysCount;
        rowValues['totalPresent'] = presentDaysCount;
        rowValues['totalAbsent'] = absentDaysCount;

        worksheet.addRow(rowValues);
    });

    const filename = `Attendance_${getExportDateSuffix()}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// Export complex, date-wise formatted attendance with location-specific holidays, Sundays, footer formulas, colors, and columns freeze
// Helper to format date to d/Mmm (e.g. 1/Apr)
function formatDateToDayMonth(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    return `${day}/${month}`;
}

// Helper to get leave type for a specific employee and date
function getLeaveTypeForDate(empName, dateStr) {
    const tx = leaveTransactions.find(t => 
        t.employeeName === empName && 
        dateStr >= t.startDate && 
        dateStr <= t.endDate
    );
    return tx ? tx.type : 'SL'; // fallback to SL if not found
}

// Export complex, date-wise formatted attendance with location-specific holidays, Sundays, footer formulas, colors, and columns freeze
async function exportFormattedAttendance() {
    const attendanceData = filterAttendanceDb();
    if (attendanceData.length === 0) {
        alert("No attendance records to export in the selected range.");
        return;
    }

    const datesInPeriod = [...new Set(attendanceData.map(r => r.date))].sort();
    if (datesInPeriod.length === 0) return;

    const employees = [...new Set(dailyAttendanceDb.map(r => r.employeeName))].sort();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Formatted Attendance');

    // 1. Setup column keys and widths (no headers set in columns array to handle manually)
    const columns = [
        { key: 'sNo', width: 8 },
        { key: 'empStatus', width: 12 },
        { key: 'joiningDate', width: 15 },
        { key: 'employeeId', width: 15 },
        { key: 'employeeName', width: 25 },
        { key: 'mode', width: 15 },
        { key: 'designation', width: 25 },
        { key: 'reportingManager', width: 25 }
    ];

    datesInPeriod.forEach(d => {
        columns.push({ key: d, width: 8 });
    });

    columns.push({ key: 'salariedWorkingDays', width: 22 });
    columns.push({ key: 'totalDaysWorked', width: 18 });
    
    // Breakdown of leaves
    columns.push({ key: 'leave_sl', width: 8 });
    columns.push({ key: 'leave_lop', width: 8 });
    columns.push({ key: 'leave_cl', width: 8 });
    columns.push({ key: 'leave_el', width: 8 });
    columns.push({ key: 'leave_bl', width: 8 });

    columns.push({ key: 'holidaysExcludingSundays', width: 30 });
    columns.push({ key: 'monthDays', width: 15 });

    worksheet.columns = columns;

    // 2. Define row 1 values (Days of week above dates)
    const row1Values = {
        sNo: '', empStatus: '', joiningDate: '', employeeId: '', employeeName: '', mode: '', designation: '', reportingManager: ''
    };
    datesInPeriod.forEach(d => {
        const dateObj = new Date(d);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        row1Values[d] = dayNames[dateObj.getDay()];
    });
    row1Values['salariedWorkingDays'] = '';
    row1Values['totalDaysWorked'] = '';
    row1Values['leave_sl'] = 'Leave'; // Label for the merged cells
    row1Values['leave_lop'] = '';
    row1Values['leave_cl'] = '';
    row1Values['leave_el'] = '';
    row1Values['leave_bl'] = '';
    row1Values['holidaysExcludingSundays'] = '';
    row1Values['monthDays'] = '';

    // 3. Define row 2 values (Labels)
    const row2Values = {
        sNo: 'S.no',
        empStatus: 'Emp Status',
        joiningDate: 'Joining Date',
        employeeId: 'ID/Employee No.',
        employeeName: 'Employee Name',
        mode: 'MODE',
        designation: 'Department/  Designation',
        reportingManager: 'Reporting Manager'
    };
    datesInPeriod.forEach(d => {
        row2Values[d] = formatDateToDayMonth(d);
    });
    row2Values['salariedWorkingDays'] = 'Working Days';
    row2Values['totalDaysWorked'] = 'Total Days Worked';
    row2Values['leave_sl'] = 'SL';
    row2Values['leave_lop'] = 'LOP';
    row2Values['leave_cl'] = 'CL';
    row2Values['leave_el'] = 'EL';
    row2Values['leave_bl'] = 'BL';
    row2Values['holidaysExcludingSundays'] = 'HOLIDAYS(EXCLUDING SUNDAYS)';
    row2Values['monthDays'] = 'MONTH(DAYS)';

    // Add header rows
    worksheet.addRow(row1Values);
    worksheet.addRow(row2Values);

    // Apply header Row 1 Styles (Blue header for days of week)
    const headerRow1 = worksheet.getRow(1);
    headerRow1.height = 24;
    for (let colIdx = 9; colIdx <= datesInPeriod.length + 8; colIdx++) {
        const cell = headerRow1.getCell(colIdx);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' } // Blue background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Merge the leave header cells in Row 1: leave_sl to leave_bl
    const leaveStartCol = datesInPeriod.length + 11;
    const leaveEndCol = datesInPeriod.length + 15;
    worksheet.mergeCells(1, leaveStartCol, 1, leaveEndCol);

    // Style merged Leave cell in Row 1
    for (let colIdx = leaveStartCol; colIdx <= leaveEndCol; colIdx++) {
        const cell = headerRow1.getCell(colIdx);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' } // Blue background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Apply header Row 2 Styles
    const headerRow2 = worksheet.getRow(2);
    headerRow2.height = 28;
    // Warm Orange background for metadata columns (1-8)
    for (let colIdx = 1; colIdx <= 8; colIdx++) {
        const cell = headerRow2.getCell(colIdx);
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC000' } // Orange background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    // Blue background for date headers (9 onwards)
    for (let colIdx = 9; colIdx <= datesInPeriod.length + 8; colIdx++) {
        const cell = headerRow2.getCell(colIdx);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' } // Blue background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    // Blue background for summary headers (salariedWorkingDays to monthDays)
    for (let colIdx = datesInPeriod.length + 9; colIdx <= datesInPeriod.length + 17; colIdx++) {
        const cell = headerRow2.getCell(colIdx);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' } // Blue background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // 4. Populate rows for each employee
    employees.forEach((emp, index) => {
        const empDetails = employeeMap[emp] || {};
        const employeeLoc = getEmployeeLocation(emp);

        const rowValues = {
            sNo: index + 1,
            empStatus: empDetails.isSuspended ? 'Suspended' : 'Active',
            joiningDate: empDetails.dateOfJoining ? formatDateToCustomStr(empDetails.dateOfJoining) : 'N/A',
            employeeId: empDetails.employeeId || 'N/A',
            employeeName: emp,
            mode: getEmployeePrimaryMode(empDetails),
            designation: empDetails.designation || 'Staff',
            reportingManager: empDetails.managerName || 'N/A'
        };

        let workingDaysCount = 0;
        let presentDaysCount = 0;
        let holidaysExcludingSundaysCount = 0;
        const monthDaysCount = datesInPeriod.length;

        // Breakdown counts
        const leaveBreakdown = { SL: 0, LOP: 0, CL: 0, EL: 0, BL: 0 };

        datesInPeriod.forEach(d => {
            const dateObj = new Date(d);
            const isSunday = dateObj.getDay() === 0;

            const isHoliday = COMPANY_HOLIDAYS.some(holiday => {
                if (holiday.date !== d) return false;
                return holiday.location === 'all' || holiday.location === employeeLoc;
            });

            if (isHoliday && !isSunday) {
                holidaysExcludingSundaysCount++;
            }

            // Strict Rule: Holiday & Sundays override present/absent and are marked with acronym 'H'
            if (isSunday || isHoliday) {
                rowValues[d] = 'H';
            } else {
                workingDaysCount++;
                const record = attendanceData.find(r => r.employeeName === emp && r.date === d);
                if (record && record.status === 'Present') {
                    rowValues[d] = 'P';
                    presentDaysCount++;
                } else if (record && record.status === 'Leave') {
                    rowValues[d] = 'L';
                    const leaveType = getLeaveTypeForDate(emp, d);
                    if (leaveBreakdown[leaveType] !== undefined) {
                        leaveBreakdown[leaveType]++;
                    }
                } else {
                    rowValues[d] = 'A';
                }
            }
        });

        rowValues['salariedWorkingDays'] = workingDaysCount;
        rowValues['totalDaysWorked'] = presentDaysCount;
        rowValues['leave_sl'] = leaveBreakdown['SL'];
        rowValues['leave_lop'] = leaveBreakdown['LOP'];
        rowValues['leave_cl'] = leaveBreakdown['CL'];
        rowValues['leave_el'] = leaveBreakdown['EL'];
        rowValues['leave_bl'] = leaveBreakdown['BL'];
        rowValues['holidaysExcludingSundays'] = holidaysExcludingSundaysCount;
        rowValues['monthDays'] = monthDaysCount;

        const addedRow = worksheet.addRow(rowValues);

        // Styling Employee Name
        addedRow.getCell(5).font = { bold: true };
        addedRow.getCell(5).alignment = { horizontal: 'left' };

        addedRow.getCell(1).alignment = { horizontal: 'center' };
        addedRow.getCell(2).alignment = { horizontal: 'center' };
        addedRow.getCell(3).alignment = { horizontal: 'center' };
        addedRow.getCell(4).alignment = { horizontal: 'center' };
        addedRow.getCell(6).alignment = { horizontal: 'center' };
        addedRow.getCell(7).alignment = { horizontal: 'left' };
        addedRow.getCell(8).alignment = { horizontal: 'left' };

        // Color coding formatting
        const fills = {
            'P': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }, // light green
            'A': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }, // light red
            'L': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }, // light blue
            'H': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }  // orange
        };

        datesInPeriod.forEach((d, dIdx) => {
            const cell = addedRow.getCell(dIdx + 9);
            const val = cell.value;
            cell.alignment = { horizontal: 'center' };

            const dateObj = new Date(d);
            const isSunday = dateObj.getDay() === 0;

            if (val === 'H') {
                if (isSunday) {
                    // Sundays styled as light grey Sunday Holidays
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                } else {
                    // Regular Company Holidays styled as orange
                    cell.fill = fills['H'];
                }
            } else if (fills[val]) {
                cell.fill = fills[val];
            }
        });

        // Center align summary cells at the end of the row
        for (let colIdx = datesInPeriod.length + 9; colIdx <= datesInPeriod.length + 17; colIdx++) {
            addedRow.getCell(colIdx).alignment = { horizontal: 'center' };
        }
    });

    worksheet.eachRow(row => {
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
        });
    });

    // Freeze first 8 columns and first 2 header rows
    worksheet.views = [{ state: 'frozen', xSplit: 8, ySplit: 2 }];

    const filename = `AttendanceFormatted_${getExportDateSuffix()}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// Export general leave details for the main dashboard button (detailed who, what type, what date)
async function exportGeneralLeavesList() {
    const data = filterLeavesDb();
    if (data.length === 0) {
        alert("No leave records available to export in the selected range.");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leaves Sheet');

    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'MODE', key: 'mode', width: 15 },
        { header: 'Reporting Manager', key: 'reportingManager', width: 25 },
        { header: 'Start Date', key: 'startDate', width: 15 },
        { header: 'End Date', key: 'endDate', width: 15 },
        { header: 'Duration (Days)', key: 'duration', width: 15 },
        { header: 'Leave Type', key: 'type', width: 15 }
    ];

    data.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(row => {
        const empDetails = employeeMap[row.employeeName] || {};
        const formattedRow = {
            employeeId: empDetails.employeeId || 'N/A',
            employeeName: row.employeeName,
            mode: getEmployeePrimaryMode(empDetails),
            reportingManager: empDetails.managerName || 'N/A',
            startDate: formatDateToCustomStr(row.startDate),
            endDate: formatDateToCustomStr(row.endDate),
            duration: row.duration,
            type: row.type
        };
        worksheet.addRow(formattedRow);
    });

    worksheet.getRow(1).font = { bold: true };

    const filename = `LeaveDetails_${getExportDateSuffix()}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// Export leave drilldown records from the modal table
async function exportLeaveDetails(leaveType) {
    const data = filterLeavesDb().filter(l => l.type === leaveType);
    if (data.length === 0) {
        alert(`No leave records available to export for ${leaveType}`);
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leave Details');

    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'MODE', key: 'mode', width: 15 },
        { header: 'Reporting Manager', key: 'reportingManager', width: 25 },
        { header: 'Start Date', key: 'startDate', width: 15 },
        { header: 'End Date', key: 'endDate', width: 15 },
        { header: 'Duration (Days)', key: 'duration', width: 15 },
        { header: 'Leave Type', key: 'type', width: 15 }
    ];

    data.forEach(row => {
        const empDetails = employeeMap[row.employeeName] || {};
        const formattedRow = {
            employeeId: empDetails.employeeId || 'N/A',
            employeeName: row.employeeName,
            mode: getEmployeePrimaryMode(empDetails),
            reportingManager: empDetails.managerName || 'N/A',
            startDate: formatDateToCustomStr(row.startDate),
            endDate: formatDateToCustomStr(row.endDate),
            duration: row.duration,
            type: row.type
        };
        worksheet.addRow(formattedRow);
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'left' };

    const filename = `LeaveDetails_${leaveType}_${getExportDateSuffix()}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// Export dynamic customer expenses list
async function exportCustomerExpensesList() {
    const data = filterExpensesDb();
    if (data.length === 0) {
        alert("No expenses available to export in the selected range.");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Expenses');

    worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Site', key: 'site', width: 25 },
        { header: 'Expense Type', key: 'category', width: 15 },
        { header: 'Amount (INR)', key: 'amount', width: 18 }
    ];

    data.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(row => {
        const formattedRow = {
            ...row,
            date: formatDateToCustomStr(row.date),
            amount: formatINR(row.amount)
        };
        worksheet.addRow(formattedRow);
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    const filename = `CustomerExpenses_${getExportDateSuffix()}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// Common core download handler using standard dynamic buffer downloader blob
async function downloadExcelWorkbook(workbook, filename) {
    try {
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error generating ExcelJS sheet download:', err);
    }
}

// Helper to convert date to DD-MMM-YYYY
function formatDateToCustomStr(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Format number value into Indian Rupees
function formatINR(val) {
    return val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });
}

// Helper suffix names based on monthly/date bounds
function getExportDateSuffix() {
    if (filterState.dateFrom && filterState.dateTo) {
        return `${filterState.dateFrom}_to_${filterState.dateTo}`;
    }
    return filterState.month === 'all' ? 'AllTime' : filterState.month.replace('-', '');
}

// ── SECTION 5: EVENT LISTENERS & INIT

// Open and render Leave Details drill-down modal
function openLeaveModal(leaveType) {
    const modal = document.getElementById('leave-modal');
    const title = document.getElementById('leave-modal-title');
    const tbody = document.getElementById('leave-modal-table-body');
    const exportBtn = document.getElementById('leave-modal-export-btn');

    if (!modal || !tbody) return;

    title.textContent = `${abbrevLeaveType(leaveType)} Leave Details`;
    tbody.innerHTML = '';

    const records = filterLeavesDb().filter(l => l.type === leaveType);

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #888;">No leave records found for this period.</td></tr>';
    } else {
        records.forEach(r => {
            const tr = document.createElement('tr');
            const dateRangeText = r.startDate === r.endDate
                ? formatDateToCustomStr(r.startDate)
                : `${formatDateToCustomStr(r.startDate)} to ${formatDateToCustomStr(r.endDate)}`;

            tr.innerHTML = `
                <td><strong>${r.employeeName}</strong></td>
                <td>${dateRangeText}</td>
                <td>${r.duration} Days</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Set clean event listeners inside modal dynamically
    const newExportBtn = exportBtn.cloneNode(true);
    exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
    newExportBtn.addEventListener('click', () => exportLeaveDetails(leaveType));

    // Display Lucide vectors inside modal
    if (window.lucide) {
        window.lucide.createIcons({
            attrs: { style: 'width: 14px; height: 14px;' }
        });
    }

    modal.classList.add('active');
}

// Close Leave Modal overlay
function closeLeaveModal() {
    const modal = document.getElementById('leave-modal');
    if (modal) modal.classList.remove('active');
}

// Initialise core script data flows
async function init() {
    console.log('Operational Analytics Dashboard Refactored Version Initializing...');

    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:5000/api/v1'
        : '/api/v1';

    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/data?duration=all`);
        if (!response.ok) throw new Error('API server returned bad status code');
        const result = await response.json();

        rawApiData = result.data;
        processRawApiData(rawApiData);

        // Remove the loading screen; pick default view based on role
        document.getElementById('dashboard-loading-spinner')?.classList.add('hidden');
        document.querySelector('.filters-container')?.classList.add('hidden');

        const userRole = window.__etplUser?.role || 'admin';
        if (userRole === 'hr') {
            // HR lands on HR Analytics
            document.getElementById('hr-dashboard-view')?.classList.remove('hidden');
            document.getElementById('nav-hr-dashboard')?.classList.add('active');
            const breadcrumb = document.getElementById('breadcrumb');
            if (breadcrumb) breadcrumb.textContent = 'HR ANALYTICS';
            fetchHrData();
        } else {
            // Admin lands on Director's Dashboard
            document.getElementById('director-dashboard-view')?.classList.remove('hidden');
            document.getElementById('nav-director-dashboard')?.classList.add('active');
            fetchDirectorData();
            loadGoogleMapsScript();
        }
        fetchCoreDashboardData();

        // Initial rendering call
        updateFilters();

        // Initial render for decoupled workforce distribution (populates dropdowns and renders chart/table for default latest date)
        renderWorkforceDistribution([]);

        // Initialize sidebar active visual tags
        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('Core Dashboard initialisation error:', err);
        const spinner = document.getElementById('dashboard-loading-spinner');
        if (spinner) {
            spinner.innerHTML = `
                <div style="text-align: center; color: var(--primary-red); padding: 40px;">
                    <h3>Failed to Load Dashboard</h3>
                    <p style="margin-top: 10px; font-size: 14px; color: var(--text-main);">Ensure the local API server is running on port 5000.</p>
                </div>
            `;
        }
    }
}

// ── Auth / Role bootstrap ────────────────────────────────────────────────────
function applyRoleBasedAccess() {
    const user = window.__etplUser;
    if (!user) return;

    // Populate topbar user info
    const nameEl   = document.getElementById('topbar-username');
    const roleEl   = document.getElementById('topbar-role');
    const avatarEl = document.getElementById('topbar-avatar');
    if (nameEl)   nameEl.textContent   = user.username;
    if (roleEl)   roleEl.textContent   = user.role === 'admin' ? 'Administrator' : 'HR';
    if (avatarEl) avatarEl.textContent = user.username.slice(0, 2).toUpperCase();

    // HR role: only HR Analytics visible
    if (user.role === 'hr') {
        ['nav-director-dashboard', 'nav-siteng-dashboard'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        localStorage.removeItem('etpl_token');
        localStorage.removeItem('etpl_user');
        window.location.replace('/login.html');
    });
}

// Bind all listeners and call initial startup
document.addEventListener('DOMContentLoaded', () => {
    // Apply role-based access before anything else renders
    applyRoleBasedAccess();

    // 1. Setup Filters event listeners
    document.getElementById('month-select')?.addEventListener('change', (e) => {
        // Clear custom date values on month select changes to keep state consistent
        if (e.target.value !== 'all') {
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
        }
        updateFilters();
    });

    document.getElementById('date-from')?.addEventListener('change', () => {
        // Reset monthly filter when custom date ranges are chosen
        document.getElementById('month-select').value = 'all';
        updateFilters();
    });

    document.getElementById('date-to')?.addEventListener('change', () => {
        document.getElementById('month-select').value = 'all';
        updateFilters();
    });

    // Chart scale selection listener
    document.getElementById('attendance-scale-select')?.addEventListener('change', () => {
        updateFilters();
    });

    // 2. Setup standard export buttons event listeners
    document.getElementById('export-attendance-raw-btn')?.addEventListener('click', exportRawAttendance);
    document.getElementById('export-leaves-btn')?.addEventListener('click', exportGeneralLeavesList);
    document.getElementById('export-attendance-formatted-btn')?.addEventListener('click', exportFormattedAttendance);
    document.getElementById('export-expenses-btn')?.addEventListener('click', exportCustomerExpensesList);

    // 3. Customer breakdowns reactive dropdown
    document.getElementById('customer-select')?.addEventListener('change', () => {
        renderCustomerBreakdowns(filterExpensesDb());
    });

    // 4. Modal dismiss event listeners
    document.getElementById('leave-modal-close')?.addEventListener('click', closeLeaveModal);
    document.getElementById('leave-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('leave-modal')) {
            closeLeaveModal();
        }
    });

    document.getElementById('workforce-modal-close')?.addEventListener('click', closeWorkforceModal);
    document.getElementById('workforce-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('workforce-modal')) {
            closeWorkforceModal();
        }
    });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLeaveModal();
            closeWorkforceModal();
            closeDirectorModal();
        }
    });

    // 5. Workforce dropdown selection event listeners
    document.getElementById('dist-month-select')?.addEventListener('change', updateWorkforceDateSelect);
    document.getElementById('dist-date-select')?.addEventListener('change', (e) => {
        if (e.target.value) {
            renderWorkforceDistributionDetails(e.target.value);
            renderWorkforceDistributionChart(e.target.value);
        }
    });

    // Sidebar collapse toggle
    document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const icon    = document.getElementById('sidebar-toggle-icon');
        const collapsed = sidebar.classList.toggle('collapsed');
        if (icon) icon.setAttribute('data-lucide', collapsed ? 'chevrons-right' : 'chevrons-left');
        if (window.lucide) lucide.createIcons();
        // resize Google Map if open
        if (window.googleMapInstance) google.maps.event.trigger(googleMapInstance, 'resize');
    });

    // Analytics Dashboards nav group collapse/expand
    const navGroupBtn   = document.getElementById('nav-group-analytics-btn');
    const navGroupItems = document.getElementById('nav-group-analytics-items');
    const navGroupChev  = document.getElementById('nav-group-analytics-chevron');
    if (navGroupBtn && navGroupItems) {
        // Set initial max-height so transition works
        navGroupItems.style.maxHeight = navGroupItems.scrollHeight + 'px';
        navGroupBtn.addEventListener('click', () => {
            const isCollapsed = navGroupItems.classList.toggle('collapsed');
            navGroupItems.style.maxHeight = isCollapsed ? '0px' : navGroupItems.scrollHeight + 'px';
            navGroupBtn.setAttribute('aria-expanded', String(!isCollapsed));
            if (navGroupChev) navGroupChev.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        });
    }

    // 6. Director Dashboard View toggles
    document.getElementById('nav-director-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllDashboardViews();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById('nav-director-dashboard').classList.add('active');
        document.getElementById('director-dashboard-view')?.classList.remove('hidden');
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) breadcrumb.textContent = "DIRECTOR'S DASHBOARD";
        document.querySelector('.filters-container')?.classList.add('hidden');
        fetchDirectorData();
        fetchCoreDashboardData();
        loadGoogleMapsScript();
    });

    document.getElementById('director-date-picker')?.addEventListener('change', () => {
        fetchDirectorData();
    });

    document.getElementById('director-refresh-btn')?.addEventListener('click', () => {
        fetchDirectorData();
    });

    document.getElementById('director-state-filter')?.addEventListener('change', () => {
        fetchDirectorData();
    });

    document.getElementById('director-customer-filter')?.addEventListener('change', () => {
        fetchDirectorData();
    });

    document.getElementById('dir-export-idle-btn')?.addEventListener('click', exportDirIdleEngineers);
    document.getElementById('dir-export-sites-risk-btn')?.addEventListener('click', exportDirSitesAtRisk);

    // 7. Click events for Director Dashboard KPI Drilldowns
    const cardsMapping = {
        'card-dir-total-employees': { type: 'totalEmployees', title: 'Total Employees' },
        'card-dir-present': { type: 'presentToday', title: 'Present Today' },
        'card-dir-on-leave': { type: 'onLeave', title: 'On Leave' },
        'card-dir-unmarked': { type: 'unmarked', title: 'Attendance Not Marked / Idle' },
        'card-dir-total-sites': { type: 'totalSites', title: 'Total Sites' },
        'card-dir-late-employees': { type: 'lateEmployees', title: 'Late Arrivals' },
        'card-dir-sites-no-engineer': { type: 'sitesWithoutEngineers', title: 'Sites Without Engineer (30d)' },
        'card-dir-total-engineers': { type: 'totalSiteEngineers', title: 'Total Site Engineers' },
        'card-dir-deployed-engineers': { type: 'deployedSiteEngineers', title: 'Deployed Site Engineers' },
        'card-dir-idle-engineers': { type: 'idleSiteEngineers', title: 'Idle Site Engineers' },
        'card-dir-engineers-leave': { type: 'siteEngineersOnLeave', title: 'Site Engineers On Leave / LWP' }
    };

    Object.keys(cardsMapping).forEach(cardId => {
        document.getElementById(cardId)?.addEventListener('click', () => {
            const info = cardsMapping[cardId];
            openDirectorKPIModal(info.type, info.title);
        });
    });

    // Close Director Modal events
    document.getElementById('director-modal-close')?.addEventListener('click', closeDirectorModal);
    document.getElementById('director-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('director-modal')) closeDirectorModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDirectorModal();
    });

    // 8. Initialize layout data loading
    init();
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 8: SITE ENGINEER DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

// Chart instances (destroyed + recreated on each fetch)
let seChartStatus       = null;
let seChartTrend        = null;
let seChartProjectProg  = null;

// Pagination state for idle-detailed modal
let seIdlePage  = 1;
let seIdleLimit = 10;
let seIdleTotal = 0;
let seIdleCache = []; // full list cached from last successful fetch

/** Resolve API base (mirrors pattern used in init / fetchDirectorData) */
function siteEngApiBase() {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://127.0.0.1:5000/api/v1'
        : '/api/v1';
}

/** Build query-string params shared across all siteng endpoints */
function siteEngParams() {
    const dateEl  = document.getElementById('siteng-date-picker');
    const monthEl = document.getElementById('siteng-month-select');
    const date    = (dateEl && dateEl.value)  ? dateEl.value  : new Date().toISOString().split('T')[0];
    const month   = (monthEl && monthEl.value) ? monthEl.value : date.substring(0, 7);
    return `date=${date}&month=${month}`;
}

/** Show/hide the site engineer view */
function showSiteEngView() {
    hideAllDashboardViews();
    document.getElementById('siteng-dashboard-view')?.classList.remove('hidden');
    document.getElementById('breadcrumb').textContent = 'MANPOWER ANALYTICS';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-siteng-dashboard')?.classList.add('active');
    document.querySelector('.filters-container')?.classList.add('hidden');
    fetchSiteEngData();
}

// ── Fetch: all 10 parallel endpoints ────────────────────────────────────────
async function fetchSiteEngData() {
    const base   = siteEngApiBase();
    const params = siteEngParams();
    const endpoints = [
        'kpi-summary', 'project-wise-progress', 'pm-performance',
        'sites-manpower-summary', 'engineer-status-today', 'manpower-trend',
        'project-health', 'alerts', 'monthly-lwp-idle-summary', 'idle-engineers'
    ];

    let results = {};
    try {
        const responses = await Promise.all(
            endpoints.map(ep => fetch(`${base}/siteng/${ep}?${params}`))
        );
        const jsons = await Promise.all(responses.map(r => r.json()));
        endpoints.forEach((ep, i) => { results[ep] = jsons[i].data || null; });
    } catch (err) {
        console.error('[siteng] fetchSiteEngData error:', err.message);
        return;
    }

    renderSiteEngKPIs(results['kpi-summary']);
    renderSiteEngAlerts(results['alerts']);
    renderSiteEngStatusChart(results['engineer-status-today']);
    renderSiteEngTrendChart(results['manpower-trend']);
    renderSiteEngProjectProgress(results['project-wise-progress']);
    renderSiteEngProjectHealth(results['project-health']);
    renderSiteEngPMPerf(results['pm-performance']);
    renderSiteEngManpowerSummary(results['sites-manpower-summary']);
    renderSiteEngMonthlySummary(results['monthly-lwp-idle-summary']);
    renderSiteEngIdleTop5(results['idle-engineers']);

    // Pre-load idle-detailed cache for export
    fetchSiteEngIdleDetailed(1, true);
}

// ── Fetch: paginated idle-detailed ──────────────────────────────────────────
async function fetchSiteEngIdleDetailed(page, cacheOnly) {
    const base   = siteEngApiBase();
    const params = siteEngParams();
    try {
        const r    = await fetch(`${base}/siteng/idle-engineers-detailed?${params}&page=${page}&limit=${seIdleLimit}`);
        const json = await r.json();
        if (!json.data) return;
        seIdlePage  = json.pagination?.page  || page;
        seIdleLimit = json.pagination?.limit || seIdleLimit;
        seIdleTotal = json.pagination?.total || 0;
        seIdleCache = json.data;
        if (!cacheOnly) renderSiteEngIdleModal(json.data);
    } catch (err) {
        console.error('[siteng] fetchSiteEngIdleDetailed error:', err.message);
    }
}

// ── Render: KPI Cards ────────────────────────────────────────────────────────
function renderSiteEngKPIs(d) {
    if (!d) return;
    sitengKpiCache = d;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '-';
    };
    set('siteng-kpi-target-sites',    d.targetSites);
    set('siteng-kpi-done-sites',      d.doneSites);
    set('siteng-kpi-visibility-sites',d.visibilitySites);
    set('siteng-kpi-achieved-pct',    d.achievedPercent != null ? `${d.achievedPercent}%` : '-');
    set('siteng-kpi-total-ff',        d.totalFieldForce);
    set('siteng-kpi-deployed',        d.deployedManpower);
    set('siteng-kpi-ratio-diff',      d.ratioDiff != null
        ? `${d.ratioDiff > 0 ? '+' : ''}${d.ratioDiff}%` : '-');
}

// ── Render: Alerts Banner ────────────────────────────────────────────────────
function renderSiteEngAlerts(d) {
    const container = document.getElementById('siteng-alerts-container');
    if (!container) return;
    if (!d) { container.innerHTML = '<p style="color:var(--text-muted)">Could not load alerts.</p>'; return; }
    const items = [
        { label: 'Engineers Idle &gt;5 Days', value: d.idleOver5Count,          icon: 'zap-off',      danger: true },
        { label: 'Sites Without Engineers',    value: d.sitesWithoutEngineers,   icon: 'map-pin-off',  danger: true },
        { label: 'LWP Today',                 value: d.highLwpCount,            icon: 'minus-circle', danger: false },
        { label: 'Projects Behind (&lt;80%)',  value: d.projectsBehind,          icon: 'trending-down',danger: true },
        { label: 'Manpower Shortage',          value: d.manpowerShortage,        icon: 'alert-circle', danger: d.manpowerShortage > 0 }
    ];
    container.innerHTML = items.map(item => {
        const cls = (item.danger && item.value > 0) ? 'danger' : 'warning';
        return `
        <div class="alert-card ${cls}">
            <i data-lucide="${item.icon}"></i>
            <div class="alert-content">
                <span class="alert-title" style="font-size:22px; font-weight:800; line-height:1;">${item.value ?? 0}</span>
                <span class="alert-desc" style="margin-top:4px;">${item.label}</span>
            </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// ── Render: Engineer Status Table ────────────────────────────────────────────
function renderSiteEngStatusChart(d) {
    const tbody = document.getElementById('siteng-status-table-tbody');
    if (!tbody) return;
    if (!d) { tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);padding:24px;">No data</td></tr>'; return; }
    sitengStatusCache = d;

    const rows = [
        { icon: 'map-pin',      label: 'On Site',    val: d.onSite   ?? 0, color: '#10b981' },
        { icon: 'building-2',   label: 'At Office',   val: d.atOffice ?? 0, color: '#6366f1' },
        { icon: 'calendar-off', label: 'On Leave',    val: d.onLeave  ?? 0, color: '#f59e0b' },
        { icon: 'minus-circle', label: 'On LWP',      val: d.onLWP    ?? 0, color: '#a78bfa' },
        { icon: 'zap-off',      label: 'Idle',        val: d.idle     ?? 0, color: '#ef4444' }
    ];
    const total = rows.reduce((s, r) => s + r.val, 0) || 1;
    tbody.innerHTML = rows.map(r => {
        const pct = ((r.val / total) * 100).toFixed(0);
        return `<tr>
            <td style="display:flex;align-items:center;gap:8px;padding:7px 10px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:#f1f5f9;flex-shrink:0;">
                    <i data-lucide="${r.icon}" style="width:13px;height:13px;color:${r.color};"></i>
                </span>
                <span style="font-size:13px;font-weight:600;color:#334155;">${r.label}</span>
            </td>
            <td class="status-count-cell" style="padding:7px 10px;">
                <span style="color:${r.color};font-size:17px;font-weight:700;">${r.val}</span>
                <span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${pct}%</span>
            </td>
        </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();

    // Also populate the 6-card activity status KPIs
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('siteng-act-onsite',    d.onSite    ?? 0);
    set('siteng-act-atoffice',  d.atOffice  ?? 0);
    set('siteng-act-onleave',   d.onLeave   ?? 0);
    set('siteng-act-lwp',       d.onLWP     ?? 0);
    set('siteng-act-idle',      d.idle      ?? 0);
}

// ── Render: 30-day Manpower Trend ────────────────────────────────────────────
function renderSiteEngTrendChart(d) {
    const el = document.getElementById('siteng-manpower-trend-chart');
    if (!el || !d || !d.length) return;
    if (seChartTrend) { seChartTrend.destroy(); seChartTrend = null; }

    const categories = d.map(r => r.date);
    seChartTrend = new ApexCharts(el, {
        chart:    { type: 'line', height: 240, toolbar: { show: false }, zoom: { enabled: false } },
        series: [
            { name: 'On Site',    data: d.map(r => r.onSite)   },
            { name: 'At Office',  data: d.map(r => r.atOffice)  },
            { name: 'Idle',       data: d.map(r => r.idle)      },
            { name: 'Traveling',  data: d.map(r => r.traveling) }
        ],
        colors:   ['#10b981','#3b82f6','#ef4444','#f59e0b'],
        xaxis:    { categories, tickAmount: 6, labels: { rotate: -30, style: { fontSize: '10px' } } },
        yaxis:    { title: { text: 'Headcount' } },
        stroke:   { curve: 'smooth', width: 2 },
        legend:   { position: 'top' },
        grid:     { borderColor: '#e5e7eb' },
        dataLabels: { enabled: false },
        tooltip:  { shared: true, intersect: false }
    });
    seChartTrend.render();
}

// ── Render: Project-wise Progress Bar Chart ──────────────────────────────────
function renderSiteEngProjectProgress(d) {
    const el = document.getElementById('siteng-project-progress-chart');
    if (!el || !d || !d.length) return;
    if (seChartProjectProg) { seChartProjectProg.destroy(); seChartProjectProg = null; }

    seChartProjectProg = new ApexCharts(el, {
        chart:  { type: 'bar', height: 240, toolbar: { show: false } },
        series: [
            { name: 'Target', data: d.map(r => r.target) },
            { name: 'Done',   data: d.map(r => r.done)   }
        ],
        colors:  ['#c7d2fe','#6366f1'],
        xaxis:   { categories: d.map(r => r.name), labels: { style: { fontSize: '11px' } } },
        yaxis:   { title: { text: 'Sites' } },
        plotOptions: { bar: { horizontal: false, columnWidth: '50%', borderRadius: 4 } },
        dataLabels: { enabled: false },
        legend:  { position: 'top' },
        grid:    { borderColor: '#e5e7eb' },
        tooltip: { y: { formatter: (val) => `${val} sites` } }
    });
    seChartProjectProg.render();
}

// ── Render: Project Health Table ─────────────────────────────────────────────
function renderSiteEngProjectHealth(d) {
    const tbody = document.getElementById('siteng-project-health-tbody');
    if (!tbody) return;
    if (!d || !d.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No data</td></tr>'; return; }
    tbody.innerHTML = d.map(r => {
        const pct     = r.target > 0 ? ((r.done / r.target) * 100).toFixed(1) : '0.0';
        const badge   = r.status === 'On Track'
            ? '<span class="status-badge status-active">On Track</span>'
            : '<span class="status-badge status-danger">Behind</span>';
        return `<tr>
            <td>${escapeHtml(r.name)}</td>
            <td style="text-align:center;">${r.target}</td>
            <td style="text-align:center;">${r.done}</td>
            <td style="text-align:center;">${r.pending}</td>
            <td style="text-align:center;">${badge}</td>
        </tr>`;
    }).join('');
    makeSortable('siteng-project-health-tbody');
}

// ── Render: PM Performance Table ─────────────────────────────────────────────
function renderSiteEngPMPerf(d) {
    const tbody = document.getElementById('siteng-pm-perf-tbody');
    if (!tbody) return;
    if (!d || !d.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No data</td></tr>'; return; }
    tbody.innerHTML = d.map(r => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td style="text-align:center;">${r.assignedCount}</td>
        <td style="text-align:center;">${r.completedCount}</td>
        <td style="text-align:center;">${r.utilizationPercent}%</td>
    </tr>`).join('');
    makeSortable('siteng-pm-perf-tbody');
}

// ── Render: Sites & Manpower Summary Mini-Grid ───────────────────────────────
function renderSiteEngManpowerSummary(d) {
    const grid = document.getElementById('siteng-manpower-summary-grid');
    if (!grid || !d) return;
    const items = [
        { label: 'Total Sites',            value: d.totalSites            },
        { label: 'Assigned Sites',         value: d.assignedSites         },
        { label: 'Active Sites',           value: d.activeSites           },
        { label: 'Upcoming Sites',         value: d.upcomingSites         },
        { label: 'Sites Without Engineers',value: d.sitesWithoutEngineers },
        { label: 'Total Manpower',         value: d.totalManpower         },
        { label: 'Active Manpower',        value: d.activeManpower        },
        { label: 'Idle Manpower',          value: d.idleManpower          },
        { label: 'Understaffed Sites',     value: d.understaffedSites     },
        { label: 'Overstaffed Sites',      value: d.overstaffedSites      }
    ];
    grid.innerHTML = items.map(item => `
        <div class="kpi-card glassmorphic" style="padding: 12px 16px;">
            <div class="kpi-data">
                <span class="kpi-value" style="font-size: 1.4rem;">${item.value ?? 0}</span>
                <span class="kpi-label">${item.label}</span>
            </div>
        </div>`).join('');
}

// ── Render: Monthly LWP / Idle Summary ──────────────────────────────────────
function renderSiteEngMonthlySummary(d) {
    if (!d) return;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? 0;
    };
    set('siteng-kpi-lwp-count',   d.lwpCount);
    set('siteng-kpi-lwp-days',    d.lwpCount);
    set('siteng-kpi-idle-days',   d.idleCount);
    set('siteng-kpi-ev-count',    d.evCount);
    set('siteng-kpi-left-count',  d.leftCount);
}

// ── Render: Idle Engineers Top-5 ─────────────────────────────────────────────
function renderSiteEngIdleTop5(d) {
    const tbody = document.getElementById('siteng-idle-top5-tbody');
    if (!tbody) return;
    if (!d || !d.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No idle engineers</td></tr>';
        return;
    }
    tbody.innerHTML = d.map(r => `<tr>
        <td>${escapeHtml(r.fullName)}</td>
        <td>${escapeHtml(r.lastProject)}</td>
        <td>${escapeHtml(r.lastLocation)}</td>
        <td style="text-align:center;">${r.idleDays}</td>
    </tr>`).join('');
    makeSortable('siteng-idle-top5-tbody');
}

// ── Render: Idle Modal Rows ───────────────────────────────────────────────────
function renderSiteEngIdleModal(rows) {
    const tbody    = document.getElementById('siteng-idle-modal-tbody');
    const pageInfo = document.getElementById('siteng-idle-modal-page-info');
    const prevBtn  = document.getElementById('siteng-idle-modal-prev');
    const nextBtn  = document.getElementById('siteng-idle-modal-next');
    if (!tbody) return;

    if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No idle engineers found</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Page 1 of 1';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(r.employeeId)}</td>
        <td>${escapeHtml(r.fullName)}</td>
        <td>${escapeHtml(r.designation)}</td>
        <td>${escapeHtml(r.managerName)}</td>
        <td>${escapeHtml(r.lastProject)}</td>
        <td>${escapeHtml(r.lastLocation)}</td>
        <td style="text-align:center;">${r.idleDays}</td>
    </tr>`).join('');

    // Reset sortable flag on page change so arrows re-attach
    const tbl = tbody.closest('table');
    if (tbl) delete tbl.dataset.sortable;
    makeSortable('siteng-idle-modal-tbody');

    const totalPages = Math.max(1, Math.ceil(seIdleTotal / seIdleLimit));
    if (pageInfo) pageInfo.textContent = `Page ${seIdlePage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = seIdlePage <= 1;
    if (nextBtn) nextBtn.disabled = seIdlePage >= totalPages;
}

// ── Export: Idle Engineers Excel ─────────────────────────────────────────────
async function exportSiteEngIdleExcel() {
    // Fetch all pages by requesting a high limit
    const base   = siteEngApiBase();
    const params = siteEngParams();
    let rows = [];
    try {
        const r    = await fetch(`${base}/siteng/idle-engineers-detailed?${params}&page=1&limit=1000`);
        const json = await r.json();
        rows = json.data || [];
    } catch (err) {
        console.error('[siteng] export idle error:', err.message);
        return;
    }
    if (!rows.length) { alert('No idle engineers to export.'); return; }

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Idle Engineers');
    worksheet.columns = [
        { header: 'Employee ID',   key: 'employeeId',   width: 14 },
        { header: 'Full Name',     key: 'fullName',      width: 24 },
        { header: 'Designation',   key: 'designation',   width: 20 },
        { header: 'Manager',       key: 'managerName',   width: 24 },
        { header: 'Last Project',  key: 'lastProject',   width: 24 },
        { header: 'Last Location', key: 'lastLocation',  width: 24 },
        { header: 'Idle Days',     key: 'idleDays',      width: 10 },
        { header: 'Reason',        key: 'reason',        width: 28 }
    ];
    rows.forEach(r => worksheet.addRow(r));
    const hRow = worksheet.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    hRow.alignment = { horizontal: 'left', vertical: 'middle' };

    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `Idle_Engineers_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Minimal HTML escape used in table rows */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Attach sortable column headers to any table.
 * Pass the tbody's id — the table and thead are found automatically.
 * Safe to call multiple times (idempotent via data-sortable flag on <table>).
 */
function makeSortable(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table || table.dataset.sortable) return; // already wired
    table.dataset.sortable = '1';

    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return;

    ths.forEach((th, colIdx) => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.style.whiteSpace = 'nowrap';

        const icon = document.createElement('span');
        icon.className = 'th-sort-icon';
        icon.style.cssText = 'margin-left:5px;opacity:0.35;font-size:10px;vertical-align:middle;';
        icon.textContent = '⇅';
        th.appendChild(icon);

        th.addEventListener('click', () => {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length <= 1) return;

            const wasAsc = th.dataset.sortDir === 'asc';
            const isAsc  = !wasAsc;

            // Reset all headers
            ths.forEach(t => {
                delete t.dataset.sortDir;
                const ic = t.querySelector('.th-sort-icon');
                if (ic) { ic.textContent = '⇅'; ic.style.opacity = '0.35'; }
            });

            th.dataset.sortDir = isAsc ? 'asc' : 'desc';
            icon.textContent = isAsc ? '▲' : '▼';
            icon.style.opacity = '1';

            rows.sort((a, b) => {
                const aText = (a.cells[colIdx]?.textContent || '').trim();
                const bText = (b.cells[colIdx]?.textContent || '').trim();
                // Strip currency/commas for numeric comparison
                const aNum = parseFloat(aText.replace(/[₹,\s%]/g, ''));
                const bNum = parseFloat(bText.replace(/[₹,\s%]/g, ''));
                if (!isNaN(aNum) && !isNaN(bNum)) return isAsc ? aNum - bNum : bNum - aNum;
                return isAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
            });

            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

// ── Site Engineer Event Listeners (separate DOMContentLoaded block) ──────────
document.addEventListener('DOMContentLoaded', () => {
    // Nav item – show siteng view
    document.getElementById('nav-siteng-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        showSiteEngView();
    });

    // hideAllDashboardViews() in each nav handler already covers siteng hiding.

    // Refresh button
    document.getElementById('siteng-refresh-btn')?.addEventListener('click', fetchSiteEngData);

    // Date / month filters auto-refresh
    document.getElementById('siteng-date-picker')?.addEventListener('change', () => {
        if (document.getElementById('siteng-dashboard-view')?.classList.contains('hidden') === false) {
            fetchSiteEngData();
        }
    });
    document.getElementById('siteng-month-select')?.addEventListener('change', () => {
        if (document.getElementById('siteng-dashboard-view')?.classList.contains('hidden') === false) {
            fetchSiteEngData();
        }
    });

    // "View All" button – open modal
    document.getElementById('siteng-view-all-idle-btn')?.addEventListener('click', async () => {
        seIdlePage = 1;
        await fetchSiteEngIdleDetailed(seIdlePage, false);
        document.getElementById('siteng-idle-modal')?.classList.add('active');
    });

    // Modal close
    document.getElementById('siteng-idle-modal-close')?.addEventListener('click', () => {
        document.getElementById('siteng-idle-modal')?.classList.remove('active');
    });
    document.getElementById('siteng-idle-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('siteng-idle-modal'))
            document.getElementById('siteng-idle-modal').classList.remove('active');
    });

    // Pagination
    document.getElementById('siteng-idle-modal-prev')?.addEventListener('click', async () => {
        if (seIdlePage <= 1) return;
        seIdlePage--;
        await fetchSiteEngIdleDetailed(seIdlePage, false);
    });
    document.getElementById('siteng-idle-modal-next')?.addEventListener('click', async () => {
        if (seIdlePage >= Math.ceil(seIdleTotal / seIdleLimit)) return;
        seIdlePage++;
        await fetchSiteEngIdleDetailed(seIdlePage, false);
    });

    // Export idle engineers
    document.getElementById('siteng-idle-modal-export-btn')?.addEventListener('click', exportSiteEngIdleExcel);

    // Set today's date as default for date picker
    const sitengDatePicker = document.getElementById('siteng-date-picker');
    if (sitengDatePicker && !sitengDatePicker.value) {
        sitengDatePicker.value = new Date().toISOString().split('T')[0];
    }
});

// ── SECTION 6: DIRECTOR DASHBOARD CONTROLLER

// ── Universal view-switcher utility ─────────────────────────────────────────
function hideAllDashboardViews() {
    document.getElementById('dashboard-loading-spinner')?.classList.add('hidden');
    document.getElementById('dashboard-main-content')?.classList.add('hidden');
    document.getElementById('director-dashboard-view')?.classList.add('hidden');
    document.getElementById('siteng-dashboard-view')?.classList.add('hidden');
    document.getElementById('hr-dashboard-view')?.classList.add('hidden');
}

let dirChartAttendanceTrends = null;
let dirChartWorkforceShare = null;
let dirVendorPayChart = null;
let directorDataCache = null;

async function fetchDirectorData() {
    const picker = document.getElementById('director-date-picker');
    const targetDate = picker ? picker.value : '2026-06-04';
    
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:5000/api/v1'
        : '/api/v1';

    try {
        const dirState = document.getElementById('director-state-filter')?.value || 'all';
        const dirCust  = document.getElementById('director-customer-filter')?.value || 'all';
        const response = await fetch(`${API_BASE_URL}/dashboard/director-data?date=${targetDate}&state=${encodeURIComponent(dirState)}&customerId=${encodeURIComponent(dirCust)}`);
        if (!response.ok) throw new Error('API server returned bad status code');
        const result = await response.json();
        
        directorDataCache = result.data;
        renderDirectorDashboard(directorDataCache);

        // Populate state dropdown from API metadata
        const stateSelect = document.getElementById('director-state-filter');
        if (stateSelect && result.data.availableStates?.length) {
            const current = stateSelect.value;
            stateSelect.innerHTML = '<option value="all">All States</option>';
            result.data.availableStates.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s; opt.textContent = s;
                if (s === current) opt.selected = true;
                stateSelect.appendChild(opt);
            });
        }
        // Populate customer/project dropdown
        const custSelect = document.getElementById('director-customer-filter');
        if (custSelect && result.data.availableCustomers?.length) {
            const current = custSelect.value;
            custSelect.innerHTML = '<option value="all">All Projects</option>';
            result.data.availableCustomers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name;
                if (c.id === current) opt.selected = true;
                custSelect.appendChild(opt);
            });
        }

        // Load and draw map markers
        loadGoogleMapsScript(() => {
            renderGoogleMap(directorDataCache.engineerLocations || []);
        }, directorDataCache.googleMapsApiKey);

        // Populate map-stat panel
        if (directorDataCache.engineerUtilization) {
            const eu = directorDataCache.engineerUtilization;
            const deployed = document.getElementById('map-stat-deployed');
            const idle     = document.getElementById('map-stat-idle');
            const onleave  = document.getElementById('map-stat-onleave');
            if (deployed) deployed.textContent = eu.deployedEngineers ?? '-';
            if (idle)     idle.textContent     = eu.idleEngineers    ?? '-';
            if (onleave)  onleave.textContent  = eu.onLeave          ?? '-';
        }

        // Fetch payment analytics and vendor payment analysis for Director Dashboard
        fetchDirectorPaymentAnalytics();
        fetchVendorPaymentAnalysis();
        fetchDirectorLeaveTable();

    } catch (err) {
        console.error('Error fetching Director Dashboard data:', err);
    }
}

function renderDirectorDashboard(data) {
    if (!data) return;

    const { workforce, siteOperations, engineerUtilization, projectPerformance, managerPerformance, alerts, charts } = data;

    // 1. Render KPIs
    document.getElementById('dir-kpi-total-employees').textContent = workforce.totalEmployees;
    
    document.getElementById('dir-kpi-present').textContent = 
        `${workforce.presentToday} (${(workforce.presentToday / (workforce.totalEmployees || 1) * 100).toFixed(1)}%)`;
        
    document.getElementById('dir-kpi-on-leave').textContent = 
        `${workforce.onLeave} (${(workforce.onLeave / (workforce.totalEmployees || 1) * 100).toFixed(1)}%)`;
        
    document.getElementById('dir-kpi-unmarked').textContent = 
        `${workforce.attendanceNotMarked} (${(workforce.attendanceNotMarked / (workforce.totalEmployees || 1) * 100).toFixed(1)}%)`;

    document.getElementById('dir-kpi-total-sites').textContent = siteOperations.totalSites;
    document.getElementById('dir-kpi-late-employees').textContent = workforce.lateEmployees;
    document.getElementById('dir-kpi-sites-no-engineer').textContent = siteOperations.sitesWithoutEngineers;
    document.getElementById('dir-kpi-sites-at-risk').textContent = siteOperations.sitesAtRisk;

    document.getElementById('dir-kpi-total-engineers').textContent = engineerUtilization.totalEngineers;
    
    document.getElementById('dir-kpi-deployed-engineers').textContent = 
        `${engineerUtilization.deployedEngineers} (${(engineerUtilization.deployedEngineers / (engineerUtilization.totalEngineers || 1) * 100).toFixed(1)}%)`;
        
    document.getElementById('dir-kpi-idle-engineers').textContent = 
        `${engineerUtilization.idleEngineers} (${(engineerUtilization.idleEngineers / (engineerUtilization.totalEngineers || 1) * 100).toFixed(1)}%)`;
        
    document.getElementById('dir-kpi-engineers-leave').textContent = 
        `${engineerUtilization.onLeave} (${(engineerUtilization.onLeave / (engineerUtilization.totalEngineers || 1) * 100).toFixed(1)}%)`;

    // 2. Render Critical Alerts Banner
    const alertsContainer = document.getElementById('director-alerts-container');
    alertsContainer.innerHTML = '';
    let hasAlerts = false;

    if (alerts.highAbsenteeism > 20) {
        hasAlerts = true;
        alertsContainer.innerHTML += `
            <div class="alert-card danger">
                <i data-lucide="alert-triangle"></i>
                <div class="alert-content">
                    <span class="alert-title">High Absenteeism Warning</span>
                    <span class="alert-desc">Today's absenteeism rate is at ${alerts.highAbsenteeism}%, exceeding the 20% limit.</span>
                </div>
            </div>
        `;
    }
    if (alerts.highLwpCount > 3) {
        hasAlerts = true;
        alertsContainer.innerHTML += `
            <div class="alert-card warning">
                <i data-lucide="alert-circle"></i>
                <div class="alert-content">
                    <span class="alert-title">High LWP Leave Volume</span>
                    <span class="alert-desc">There are ${alerts.highLwpCount} employees on Loss of Pay (LWP) leave today.</span>
                </div>
            </div>
        `;
    }
    if (alerts.projectsBehind && alerts.projectsBehind.length > 0) {
        hasAlerts = true;
        const projectNames = alerts.projectsBehind.map(p => `${p.name} (${p.achievementPercent}%)`).join(', ');
        alertsContainer.innerHTML += `
            <div class="alert-card danger">
                <i data-lucide="alert-triangle"></i>
                <div class="alert-content">
                    <span class="alert-title">Projects Behind Target</span>
                    <span class="alert-desc">The following projects have site completion rates below 80%: ${projectNames}.</span>
                </div>
            </div>
        `;
    }
    if (alerts.sitesWithoutEngineers && alerts.sitesWithoutEngineers.length > 0) {
        hasAlerts = true;
        alertsContainer.innerHTML += `
            <div class="alert-card warning">
                <i data-lucide="alert-circle"></i>
                <div class="alert-content">
                    <span class="alert-title">Active Sites Without Staffing</span>
                    <span class="alert-desc">There are ${alerts.sitesWithoutEngineers.length} active sites with no check-in recorded for over 30 days.</span>
                </div>
            </div>
        `;
    }
    if (alerts.idleEngineers && alerts.idleEngineers.length > 0) {
        hasAlerts = true;
        alertsContainer.innerHTML += `
            <div class="alert-card warning">
                <i data-lucide="alert-circle"></i>
                <div class="alert-content">
                    <span class="alert-title">Idle Field Engineers</span>
                    <span class="alert-desc">${alerts.idleEngineers.length} site technicians have had no check-in recorded in the last 5 days.</span>
                </div>
            </div>
        `;
    }
    if (!hasAlerts) {
        alertsContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--primary-green); padding: 12px; font-weight: 600;">All operational metrics within standard tolerances. No critical warnings today.</div>`;
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // 3. Render Tables
    // Project Manager Team Utilization Table
    const pmBody = document.getElementById('dir-pm-performance-table-body');
    pmBody.innerHTML = '';
    if (managerPerformance.length === 0) {
        pmBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #888;">No manager data.</td></tr>';
    } else {
        managerPerformance.forEach(pm => {
            pmBody.innerHTML += `
                <tr>
                    <td><strong>${pm.name}</strong></td>
                    <td style="text-align: center;">${pm.teamSize}</td>
                    <td style="text-align: center;">${pm.deployedCount}</td>
                    <td style="text-align: center;">
                        <span class="badge-pill ${pm.utilizationPercent >= 80 ? 'green' : pm.utilizationPercent >= 50 ? 'blue' : 'red'}" style="padding: 4px 10px; font-weight: bold;">
                             ${pm.utilizationPercent}%
                        </span>
                    </td>
                </tr>
            `;
        });
    }

    // Project Health Table
    const projectBody = document.getElementById('dir-project-health-table-body');
    projectBody.innerHTML = '';
    if (projectPerformance.length === 0) {
        projectBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888;">No project data.</td></tr>';
    } else {
        projectPerformance.forEach(p => {
            projectBody.innerHTML += `
                <tr>
                    <td><strong>${p.name}</strong></td>
                    <td style="text-align: center;">${p.totalSites}</td>
                    <td style="text-align: center;">${p.completedSites}</td>
                    <td style="text-align: center;">${p.pendingSites}</td>
                    <td style="text-align: center;">
                        <span class="badge-pill ${p.achievementPercent >= 80 ? 'green' : 'blue'}" style="padding: 4px 10px; font-weight: bold;">
                             ${p.achievementPercent}%
                        </span>
                    </td>
                </tr>
            `;
        });
    }

    // Idle Engineers Table
    const idleBody = document.getElementById('dir-idle-engineers-table-body');
    idleBody.innerHTML = '';
    if (alerts.idleEngineers.length === 0) {
        idleBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #888;">No idle engineers.</td></tr>';
    } else {
        alerts.idleEngineers.forEach(eng => {
            idleBody.innerHTML += `
                <tr>
                    <td>${eng.employeeId || 'N/A'}</td>
                    <td><strong>${eng.fullName}</strong></td>
                    <td>${eng.designation || 'Staff'}</td>
                    <td>${eng.managerName}</td>
                </tr>
            `;
        });
    }

    // Sites At Risk Table (element may not exist if section was removed)
    const sitesRiskBody = document.getElementById('dir-sites-risk-table-body');
    if (sitesRiskBody) {
        sitesRiskBody.innerHTML = '';
        if (alerts.sitesWithoutEngineers.length === 0) {
            sitesRiskBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #888;">No unstaffed sites.</td></tr>';
        } else {
            alerts.sitesWithoutEngineers.forEach(s => {
                sitesRiskBody.innerHTML += `
                    <tr>
                        <td>${s.siteId || 'N/A'}</td>
                        <td><strong>${s.name}</strong></td>
                        <td>${s.projectName}</td>
                        <td>${s.state} / ${s.district}</td>
                    </tr>
                `;
            });
        }
    }

    makeSortable('dir-pm-performance-table-body');
    makeSortable('dir-project-health-table-body');
    makeSortable('dir-idle-engineers-table-body');

    // 4. Render Charts
    renderDirectorCharts(charts);
}

function renderDirectorCharts(chartData) {
    // Workforce Share Donut Chart (compact, legend on right)
    const el = document.querySelector('#dir-workforce-share-chart');
    if (!el || !chartData?.workforceDistribution) return;
    const wd = chartData.workforceDistribution;
    const shareOptions = {
        series: [Math.max(0, wd.present ?? 0), Math.max(0, wd.leave ?? 0), Math.max(0, wd.absent ?? 0)],
        labels: ['Present', 'On Leave', 'Absent / Idle'],
        chart: { type: 'donut', height: 220, toolbar: { show: false } },
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        legend: { position: 'right', fontSize: '11px' },
        plotOptions: { pie: { donut: { size: '55%' } } },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        },
        tooltip: { y: { formatter: (val) => `${val} engineers` } }
    };

    if (dirChartWorkforceShare) dirChartWorkforceShare.destroy();
    dirChartWorkforceShare = new ApexCharts(el, shareOptions);
    dirChartWorkforceShare.render();
}

// Export lists using ExcelJS
async function exportDirIdleEngineers() {
    if (!directorDataCache || !directorDataCache.alerts.idleEngineers.length) {
        alert('No idle engineers records to export.');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Idle Engineers');

    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'fullName', width: 25 },
        { header: 'Designation', key: 'designation', width: 25 },
        { header: 'Manager Name', key: 'managerName', width: 25 }
    ];

    directorDataCache.alerts.idleEngineers.forEach(eng => {
        worksheet.addRow(eng);
    });

    worksheet.getRow(1).font = { bold: true };
    const filename = `IdleEngineers_Report.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

async function exportDirSitesAtRisk() {
    if (!directorDataCache || !directorDataCache.alerts.sitesWithoutEngineers.length) {
        alert('No unstaffed sites records to export.');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sites At Risk');

    worksheet.columns = [
        { header: 'Site ID', key: 'siteId', width: 15 },
        { header: 'Site Name', key: 'name', width: 25 },
        { header: 'Project / Customer', key: 'projectName', width: 25 },
        { header: 'State', key: 'state', width: 15 },
        { header: 'District', key: 'district', width: 15 }
    ];

    directorDataCache.alerts.sitesWithoutEngineers.forEach(s => {
        worksheet.addRow(s);
    });

    worksheet.getRow(1).font = { bold: true };
    const filename = `SitesAtRisk_Report.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}

// ── SECTION 7: DYNAMIC GOOGLE MAPS AND DRILLDOWNS

function loadGoogleMapsScript(callback, apiKey) {
    if (window.google && window.google.maps) {
        if (callback) callback();
        return;
    }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
        const checkInterval = setInterval(() => {
            if (window.google && window.google.maps) {
                clearInterval(checkInterval);
                if (callback) callback();
            }
        }, 100);
        return;
    }
    if (!apiKey) {
        // Wait until we have the API key from backend before adding the script
        return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
        if (callback) callback();
    };
    document.head.appendChild(script);
}

let googleMapInstance = null;
let mapMarkers = [];

function renderGoogleMap(locations) {
    const mapElement = document.getElementById('director-map');
    if (!mapElement) return;

    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded.');
        return;
    }

    if (!googleMapInstance) {
        const indiaBounds = new google.maps.LatLngBounds(
            { lat: 6.4627,  lng: 68.1097 },   // SW corner
            { lat: 35.6745, lng: 97.3953 }    // NE corner
        );
        googleMapInstance = new google.maps.Map(mapElement, {
            center: { lat: 20.5937, lng: 78.9629 }, // Centre of India
            zoom: 5,
            restriction: { latLngBounds: indiaBounds, strictBounds: false },
            minZoom: 4,
            styles: [
                {
                    "featureType": "administrative",
                    "elementType": "labels.text.fill",
                    "textColor": "#444444"
                },
                {
                    "featureType": "landscape",
                    "elementType": "all",
                    "color": "#f2f2f2"
                },
                {
                    "featureType": "poi",
                    "elementType": "all",
                    "visibility": "off"
                },
                {
                    "featureType": "road",
                    "elementType": "all",
                    "visibility": "simplified"
                },
                {
                    "featureType": "transit",
                    "elementType": "all",
                    "visibility": "off"
                },
                {
                    "featureType": "water",
                    "elementType": "all",
                    "color": "#c8d7f4"
                }
            ]
        });
    }

    // Clear existing markers
    mapMarkers.forEach(m => m.setMap(null));
    mapMarkers = [];

    const infoWindow = new google.maps.InfoWindow();

    // Palette of vibrant, fixed colors for different projects/sites
    const getProjectColor = (customerName) => {
        if (!customerName) return '#6b7280'; // Slate Gray for unknown
        const name = customerName.trim();
        const lower = name.toLowerCase();
        if (lower.includes('hero')) return '#dc2626'; // Vibrant Red
        if (lower.includes('reliance') || lower.includes('bp mobility')) return '#2563eb'; // Vibrant Blue
        if (lower.includes('v-green hpcl') || lower.includes('hpcl')) return '#10b981'; // Vibrant Green
        if (lower.includes('v-green b2c')) return '#06b6d4'; // Vibrant Cyan/Teal
        return '#6b7280'; // Slate Gray fallback
    };

    locations.forEach(loc => {
        if (!loc.lat || !loc.lng) return;

        const projectColor = getProjectColor(loc.customerName);

        const marker = new google.maps.Marker({
            position: { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) },
            map: googleMapInstance,
            title: loc.engineerName,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 11, // Increased scale to make dots bigger
                fillColor: projectColor, // project-specific color
                fillOpacity: 0.9,
                strokeWeight: 2,
                strokeColor: '#ffffff'
            }
        });

        marker.addListener('click', () => {
            const contentString = `
                <div style="font-family: 'Public Sans', sans-serif; padding: 10px 14px; font-size: 13px; line-height: 1.6; color: #374151; max-width: 280px; border-radius: 8px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #1e1b4b; border-bottom: 2px solid ${projectColor}; padding-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${projectColor};"></span>
                        ${loc.engineerName}
                    </h4>
                    <div style="display: grid; gap: 4px;">
                        <p style="margin: 0;"><strong>Customer:</strong> ${loc.customerName}</p>
                        <p style="margin: 0;"><strong>Site Name:</strong> ${loc.siteName}</p>
                        <p style="margin: 0;"><strong>Location:</strong> ${[loc.district, loc.state].filter(Boolean).join(', ') || 'N/A'}</p>
                        <p style="margin: 0;"><strong>Reporting Manager:</strong> <span style="font-weight: 600; color: #4f46e5;">${loc.managerName || 'N/A'}</span></p>
                        <p style="margin: 0; border-top: 1px dashed #e5e7eb; margin-top: 6px; padding-top: 6px; font-size: 12px; color: #6b7280;">
                            <strong>Checked In:</strong> ${loc.checkInTime}
                        </p>
                    </div>
                </div>
            `;
            infoWindow.setContent(contentString);
            infoWindow.open(googleMapInstance, marker);
        });

        mapMarkers.push(marker);
    });

    if (locations.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        locations.forEach(loc => {
            bounds.extend({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
        });
        googleMapInstance.fitBounds(bounds);

        const listener = google.maps.event.addListener(googleMapInstance, 'idle', () => {
            if (googleMapInstance.getZoom() > 10) {
                googleMapInstance.setZoom(10);
            }
            google.maps.event.removeListener(listener);
        });
    } else {
        googleMapInstance.setCenter({ lat: 20.5937, lng: 78.9629 });
        googleMapInstance.setZoom(5);
    }
}

function openDirectorKPIModal(type, title) {
    const modal = document.getElementById('director-modal');
    const titleEl = document.getElementById('director-modal-title');
    const headerEl = document.getElementById('director-modal-table-header');
    const bodyEl = document.getElementById('director-modal-table-body');
    const exportBtn = document.getElementById('director-modal-export-btn');

    if (!modal || !bodyEl || !directorDataCache) return;

    titleEl.textContent = `${title} Details`;
    headerEl.innerHTML = '';
    bodyEl.innerHTML = '';

    const records = directorDataCache.details[type] || [];

    let columns = [];
    if (['totalEmployees', 'unmarked', 'totalSiteEngineers', 'idleSiteEngineers'].includes(type)) {
        columns = ['Emp ID', 'Full Name', 'Designation', 'Base Location', 'Manager'];
    } else if (['presentToday', 'lateEmployees', 'deployedSiteEngineers'].includes(type)) {
        columns = ['Emp ID', 'Full Name', 'Designation', 'Site Name', 'Check-In Time'];
    } else if (['onLeave', 'siteEngineersOnLeave'].includes(type)) {
        columns = ['Emp ID', 'Full Name', 'Designation', 'Leave Type', 'Duration', 'Manager'];
    } else if (['totalSites', 'sitesWithoutEngineers', 'sitesAtRisk'].includes(type)) {
        columns = ['Site ID', 'Site Name', 'Project / Customer', 'Status', 'State / District'];
    }

    const trHead = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        if (col === 'Duration' || col === 'Check-In Time' || col === 'Status') {
            th.style.textAlign = 'center';
        }
        trHead.appendChild(th);
    });
    headerEl.appendChild(trHead);

    if (records.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="${columns.length}" style="text-align: center; color: #888; padding: 20px;">No records available.</td>`;
        bodyEl.appendChild(tr);
    } else {
        records.forEach(r => {
            const tr = document.createElement('tr');
            if (['totalEmployees', 'unmarked', 'totalSiteEngineers', 'idleSiteEngineers'].includes(type)) {
                tr.innerHTML = `
                    <td>${r.employeeId || 'N/A'}</td>
                    <td><strong>${r.fullName}</strong></td>
                    <td>${r.designation}</td>
                    <td>${r.baseLocation}</td>
                    <td>${r.managerName}</td>
                `;
            } else if (['presentToday', 'lateEmployees', 'deployedSiteEngineers'].includes(type)) {
                tr.innerHTML = `
                    <td>${r.employeeId || 'N/A'}</td>
                    <td><strong>${r.fullName}</strong></td>
                    <td>${r.designation}</td>
                    <td>${r.siteName}</td>
                    <td style="text-align: center;"><span class="badge-pill blue">${r.checkInTime}</span></td>
                `;
            } else if (['onLeave', 'siteEngineersOnLeave'].includes(type)) {
                tr.innerHTML = `
                    <td>${r.employeeId || 'N/A'}</td>
                    <td><strong>${r.fullName}</strong></td>
                    <td>${r.designation}</td>
                    <td style="text-align: center;"><span class="badge-pill orange">${r.type}</span></td>
                    <td style="text-align: center;"><strong>${r.duration} Days</strong></td>
                    <td>${r.managerName}</td>
                `;
            } else if (['totalSites', 'sitesWithoutEngineers', 'sitesAtRisk'].includes(type)) {
                tr.innerHTML = `
                    <td>${r.siteId || 'N/A'}</td>
                    <td><strong>${r.name}</strong></td>
                    <td>${r.projectName}</td>
                    <td style="text-align: center;"><span class="badge-pill green">${r.status}</span></td>
                    <td>${r.state} / ${r.district}</td>
                `;
            }
            bodyEl.appendChild(tr);
        });
    }

    const newExportBtn = exportBtn.cloneNode(true);
    exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
    newExportBtn.addEventListener('click', () => exportDirectorKPIDrilldown(type, title, records));

    if (window.lucide) {
        window.lucide.createIcons();
    }

    modal.classList.add('active');
}

function closeDirectorModal() {
    const modal = document.getElementById('director-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

async function exportDirectorKPIDrilldown(type, title, records) {
    if (!records || records.length === 0) {
        alert("No records to export.");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title.substring(0, 31));

    let columns = [];
    if (['totalEmployees', 'unmarked', 'totalSiteEngineers', 'idleSiteEngineers'].includes(type)) {
        columns = [
            { header: 'Employee ID', key: 'employeeId', width: 15 },
            { header: 'Full Name', key: 'fullName', width: 25 },
            { header: 'Designation', key: 'designation', width: 25 },
            { header: 'Base Location', key: 'baseLocation', width: 20 },
            { header: 'Reporting Manager', key: 'managerName', width: 25 }
        ];
    } else if (['presentToday', 'lateEmployees', 'deployedSiteEngineers'].includes(type)) {
        columns = [
            { header: 'Employee ID', key: 'employeeId', width: 15 },
            { header: 'Full Name', key: 'fullName', width: 25 },
            { header: 'Designation', key: 'designation', width: 25 },
            { header: 'Site Name', key: 'siteName', width: 30 },
            { header: 'Customer Name', key: 'customerName', width: 30 },
            { header: 'Check-In Time', key: 'checkInTime', width: 15 }
        ];
    } else if (['onLeave', 'siteEngineersOnLeave'].includes(type)) {
        columns = [
            { header: 'Employee ID', key: 'employeeId', width: 15 },
            { header: 'Full Name', key: 'fullName', width: 25 },
            { header: 'Designation', key: 'designation', width: 25 },
            { header: 'Leave Type', key: 'type', width: 15 },
            { header: 'Start Date', key: 'startDate', width: 15 },
            { header: 'End Date', key: 'endDate', width: 15 },
            { header: 'Duration (Days)', key: 'duration', width: 15 },
            { header: 'Reporting Manager', key: 'managerName', width: 25 }
        ];
    } else if (['totalSites', 'sitesWithoutEngineers', 'sitesAtRisk'].includes(type)) {
        columns = [
            { header: 'Site ID', key: 'siteId', width: 15 },
            { header: 'Site Name', key: 'name', width: 30 },
            { header: 'Project / Customer', key: 'projectName', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'State', key: 'state', width: 20 },
            { header: 'District', key: 'district', width: 20 }
        ];
    }

    worksheet.columns = columns;

    records.forEach(r => {
        const rowVal = { ...r };
        if (rowVal.startDate) rowVal.startDate = formatDateToCustomStr(rowVal.startDate);
        if (rowVal.endDate) rowVal.endDate = formatDateToCustomStr(rowVal.endDate);
        worksheet.addRow(rowVal);
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6366F1' }
    };
    headerRow.alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.eachRow(row => {
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
        });
    });

    const picker = document.getElementById('director-date-picker');
    const targetDate = picker ? picker.value.replace(/-/g, '') : '';
    const filename = `${title.replace(/\s+/g, '_')}_Report_${targetDate}.xlsx`;
    await downloadExcelWorkbook(workbook, filename);
}



// ════════════════════════════════════════════════════════════════════════════
// SECTION 9 — HR ANALYTICS DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

let hrChartAttendance   = null;
let hrChartLeaveStatus  = null;
let hrLeaveReqPage      = 1;
let hrLeaveReqLimit     = 10;
let hrLeaveReqTotal     = 0;
let hrLeaveReqStatus    = 'all';
let hrCurrentData       = {};
let hrLwpData           = [];
let hrLeaveReqData      = [];

// ── URL helpers ──────────────────────────────────────────────────────────────

function hrApiBase() {
    return '/api/v1/hr';
}

function hrParams() {
    const month = document.getElementById('hr-month-select')?.value || currentMonth();
    const state = document.getElementById('hr-state-filter')?.value || 'all';
    return `?month=${encodeURIComponent(month)}&state=${encodeURIComponent(state)}`;
}

function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function hrFmtInr(n) {
    if (!n && n !== 0) return '—';
    if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
    if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
    if (n >= 1000)     return `₹${(n/1000).toFixed(1)}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── Navigation / view toggle ─────────────────────────────────────────────────

function showHrView() {
    hideAllDashboardViews();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-hr-dashboard')?.classList.add('active');
    document.querySelector('.filters-container')?.classList.add('hidden');
    const view = document.getElementById('hr-dashboard-view');
    if (view) view.classList.remove('hidden');

    const bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = 'HR ANALYTICS';

    fetchHrData();
}

// ── Main data fetch ──────────────────────────────────────────────────────────

async function fetchHrData() {
    const base   = hrApiBase();
    const params = hrParams();
    const lsParams = `${params}&status=${encodeURIComponent(hrLeaveReqStatus)}&page=${hrLeaveReqPage}&limit=${hrLeaveReqLimit}`;

    try {
        const [
            headcountRes,
            leaveSumRes,
            expenseRes,
            regularRes,
            lwpRes,
            heatmapRes,
            pendingRes,
            leaveReqRes
        ] = await Promise.allSettled([
            fetch(`${base}/headcount-summary${params}`).then(r => r.json()),
            fetch(`${base}/leave-summary${params}`).then(r => r.json()),
            fetch(`${base}/expense-summary${params}`).then(r => r.json()),
            fetch(`${base}/regularization-summary${params}`).then(r => r.json()),
            fetch(`${base}/lwp-monthly${params}`).then(r => r.json()),
            fetch(`${base}/attendance-heatmap${params}`).then(r => r.json()),
            fetch(`${base}/pending-approvals${params}`).then(r => r.json()),
            fetch(`${base}/leave-requests${lsParams}`).then(r => r.json())
        ]);

        const get = (res) => res.status === 'fulfilled' && res.value?.success ? res.value.data : null;

        const hc      = get(headcountRes);
        const ls      = get(leaveSumRes);
        const exp     = get(expenseRes);
        const reg     = get(regularRes);
        const lwp     = get(lwpRes);
        const hm      = get(heatmapRes);
        const pending = get(pendingRes);
        const lrResp  = leaveReqRes.status === 'fulfilled' ? leaveReqRes.value : null;

        // Cache for exports and KPI drilldowns
        hrLwpData        = lwp?.employees       || [];
        hrLeaveReqData   = lrResp?.data         || [];
        hrLeaveReqTotal  = lrResp?.pagination?.total || 0;
        hrCurrentData    = { hc, ls, exp, reg, lwp, hm, pending };
        hrHeadcountCache = hc;

        // Populate HR state dropdown (once, on first load if empty)
        const hrStateSelect = document.getElementById('hr-state-filter');
        if (hrStateSelect && hrStateSelect.options.length <= 1) {
            try {
                const statesRes = await fetch(`${hrApiBase()}/headcount-summary${hrParams()}`);
                // States come from director data; fall back to site states via a separate call
                const dirRes = await fetch('/api/v1/dashboard/director-data');
                if (dirRes.ok) {
                    const dirJson = await dirRes.json();
                    const states = dirJson.data?.availableStates || [];
                    const curVal = hrStateSelect.value;
                    hrStateSelect.innerHTML = '<option value="all">All States</option>';
                    states.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s; opt.textContent = s;
                        if (s === curVal) opt.selected = true;
                        hrStateSelect.appendChild(opt);
                    });
                }
            } catch (_) { /* dropdown stays with All States */ }
        }

        renderHrHeadcount(hc);
        renderHrLeaveKPIs(ls);
        renderHrExpenseKPIs(exp);
        renderHrRegLwp(reg, lwp);
        renderHrAttendanceChart(hm);
        renderHrLeaveStatusChart(ls);
        renderHrPendingApprovals(pending);
        renderHrLeaveRequests(hrLeaveReqData);
        renderHrLwpTable(hrLwpData);
        renderHrLeavePageInfo();

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('[HR] fetchHrData error:', err);
    }
}

// ── KPI Renders ──────────────────────────────────────────────────────────────

function renderHrHeadcount(hc) {
    if (!hc) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    set('hr-kpi-total-active',   hc.totalActive);
    set('hr-kpi-suspended',      hc.totalSuspended);
    set('hr-kpi-site-engineers', hc.breakdown?.siteEngineers ?? '-');
    set('hr-kpi-managers',       hc.breakdown?.managers ?? '-');
}

function renderHrLeaveKPIs(ls) {
    if (!ls) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    set('hr-kpi-leave-pending',  ls.pending);
    set('hr-kpi-leave-approved', ls.approved);
    set('hr-kpi-leave-rejected', ls.rejected);
    set('hr-kpi-leave-days',     ls.totalApprovedDays);
}

function renderHrExpenseKPIs(exp) {
    if (!exp) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    set('hr-kpi-exp-pending-count',  exp.pending?.count  ?? '-');
    set('hr-kpi-exp-approved-amt',   hrFmtInr(exp.approved?.amount));
    set('hr-kpi-exp-rejected-count', exp.rejected?.count ?? '-');
    set('hr-kpi-exp-total-amt',      hrFmtInr(exp.totalAmount));
}

function renderHrRegLwp(reg, lwp) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    if (reg) {
        set('hr-kpi-absent-days', reg.absentPersonDays);
        set('hr-kpi-absent-emps', reg.absentEmployeeCount);
    }
    if (lwp) {
        set('hr-kpi-lwp-count', lwp.lwpCount);
        set('hr-kpi-lwp-days',  lwp.totalLwpDays);
    }
}

// ── Charts ───────────────────────────────────────────────────────────────────

function renderHrAttendanceChart(series) {
    const el = document.getElementById('hr-attendance-chart');
    if (!el || !series || !series.length) return;

    if (hrChartAttendance) { hrChartAttendance.destroy(); hrChartAttendance = null; }

    const dates   = series.map(s => s.date);
    const present = series.map(s => s.present);
    const onLeave = series.map(s => s.onLeave);
    const absent  = series.map(s => s.absent);

    hrChartAttendance = new ApexCharts(el, {
        series: [
            { name: 'Present',  data: present },
            { name: 'On Leave', data: onLeave },
            { name: 'Absent',   data: absent  }
        ],
        chart: { type: 'area', height: 260, toolbar: { show: false }, animations: { enabled: false } },
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.1 } },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            categories: dates,
            labels: { rotate: -45, rotateAlways: false, style: { fontSize: '10px' }, formatter: (v) => v ? v.substring(5) : v },
            tickAmount: 10
        },
        yaxis: { labels: { style: { fontSize: '11px' } } },
        legend: { position: 'top' },
        tooltip: { x: { format: 'yyyy-MM-dd' } },
        dataLabels: { enabled: false },
        grid: { borderColor: 'rgba(255,255,255,0.1)', strokeDashArray: 3 }
    });
    hrChartAttendance.render();
}

function renderHrLeaveStatusChart(ls) {
    const el = document.getElementById('hr-leave-status-chart');
    if (!el || !ls) return;

    if (hrChartLeaveStatus) { hrChartLeaveStatus.destroy(); hrChartLeaveStatus = null; }

    hrChartLeaveStatus = new ApexCharts(el, {
        series: [ls.pending || 0, ls.approved || 0, ls.rejected || 0],
        chart:  { type: 'donut', height: 260 },
        labels: ['Pending', 'Approved', 'Rejected'],
        colors: ['#f59e0b', '#10b981', '#ef4444'],
        plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total' } } } } },
        legend: { position: 'bottom' },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            style: { fontSize: '11px', fontWeight: '600', colors: ['#fff'] },
            dropShadow: { enabled: false }
        }
    });
    hrChartLeaveStatus.render();
}

// ── Table Renders ─────────────────────────────────────────────────────────────

function renderHrPendingApprovals(pending) {
    const tbody = document.getElementById('hr-pending-approvals-tbody');
    if (!tbody || !pending) return;

    const lBadge = document.getElementById('hr-pending-leave-badge');
    const eBadge = document.getElementById('hr-pending-exp-badge');
    if (lBadge) lBadge.textContent = `${pending.pendingLeaveCount ?? 0} Leaves`;
    if (eBadge) eBadge.textContent = `${pending.pendingExpenseCount ?? 0} Expenses`;

    const items = pending.items || [];
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">No pending approvals</td></tr>';
        return;
    }
    tbody.innerHTML = items.slice(0, 15).map(item => `
        <tr>
            <td>
                <div style="font-weight:600;font-size:13px;">${escapeHtml(item.fullName)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(item.designation)}</div>
            </td>
            <td>
                <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${item.type==='leave'?'#fef3c7':'#ede9fe'};color:${item.type==='leave'?'#92400e':'#5b21b6'}">
                    ${item.type === 'leave' ? 'Leave' : 'Expense'}
                </span>
            </td>
            <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(item.detail)}</td>
        </tr>`).join('');
    makeSortable('hr-pending-approvals-tbody');
}

function renderHrLeaveRequests(rows) {
    const tbody = document.getElementById('hr-leave-requests-tbody');
    if (!tbody) return;
    if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No records</td></tr>';
        return;
    }
    const statusColor = { Pending: '#f59e0b', Approved: '#10b981', Rejected: '#ef4444' };
    const statusBg    = { Pending: '#fef3c7', Approved: '#d1fae5', Rejected: '#fee2e2' };
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>
                <div style="font-weight:600;font-size:13px;">${escapeHtml(r.fullName)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.employeeId)} · ${escapeHtml(r.type)}</div>
            </td>
            <td style="font-size:12px;">${r.startDate ? r.startDate.substring(0,10) : '-'}<br><span style="color:var(--text-muted)">to ${r.endDate ? r.endDate.substring(0,10) : '-'}</span></td>
            <td style="text-align:center;font-weight:600;">${r.days}</td>
            <td style="text-align:center;">
                <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${statusBg[r.status]||'#f3f4f6'};color:${statusColor[r.status]||'#374151'}">
                    ${escapeHtml(r.status)}
                </span>
            </td>
        </tr>`).join('');
    makeSortable('hr-leave-requests-tbody');
}

function renderHrLeavePageInfo() {
    const info = document.getElementById('hr-leave-page-info');
    if (info) {
        const totalPages = Math.max(1, Math.ceil(hrLeaveReqTotal / hrLeaveReqLimit));
        info.textContent = `Page ${hrLeaveReqPage} / ${totalPages} (${hrLeaveReqTotal} total)`;
    }
    const prevBtn = document.getElementById('hr-leave-prev-btn');
    const nextBtn = document.getElementById('hr-leave-next-btn');
    if (prevBtn) prevBtn.disabled = hrLeaveReqPage <= 1;
    if (nextBtn) nextBtn.disabled = hrLeaveReqPage * hrLeaveReqLimit >= hrLeaveReqTotal;
}

function renderHrLwpTable(rows) {
    const tbody = document.getElementById('hr-lwp-tbody');
    if (!tbody) return;
    if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No LWP records for this period</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>
                <div style="font-weight:600;font-size:13px;">${escapeHtml(r.fullName)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.employeeId)}</div>
            </td>
            <td style="font-size:12px;">${escapeHtml(r.designation)}</td>
            <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(r.managerName)}</td>
            <td style="text-align:center;font-weight:700;color:#ef4444;">${r.days}</td>
        </tr>`).join('');
    makeSortable('hr-lwp-tbody');
}

// ── Exports ───────────────────────────────────────────────────────────────────

async function exportHrLeaves() {
    if (!hrLeaveReqData.length) { alert('No leave data to export'); return; }
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leave Requests');
    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 14 },
        { header: 'Name',        key: 'fullName',   width: 24 },
        { header: 'Designation', key: 'designation',width: 20 },
        { header: 'Manager',     key: 'managerName',width: 22 },
        { header: 'Type',        key: 'type',       width: 14 },
        { header: 'Start Date',  key: 'startDate',  width: 14 },
        { header: 'End Date',    key: 'endDate',    width: 14 },
        { header: 'Days',        key: 'days',       width: 8  },
        { header: 'Status',      key: 'status',     width: 12 }
    ];
    hrLeaveReqData.forEach(r => worksheet.addRow(r));
    const hdr = worksheet.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    await downloadExcelWorkbook(workbook, `Leave_Requests_${hrParams().replace(/[^0-9a-z-]/gi,'_')}.xlsx`);
}

async function exportHrLwp() {
    if (!hrLwpData.length) { alert('No LWP data to export'); return; }
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('LWP Summary');
    worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 14 },
        { header: 'Name',        key: 'fullName',   width: 24 },
        { header: 'Designation', key: 'designation',width: 20 },
        { header: 'Manager',     key: 'managerName',width: 22 },
        { header: 'Start Date',  key: 'startDate',  width: 14 },
        { header: 'End Date',    key: 'endDate',    width: 14 },
        { header: 'LWP Days',    key: 'days',       width: 10 }
    ];
    hrLwpData.forEach(r => worksheet.addRow(r));
    const hdr = worksheet.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
    await downloadExcelWorkbook(workbook, `LWP_Summary_${hrParams().replace(/[^0-9a-z-]/gi,'_')}.xlsx`);
}

// ── Event Listeners ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Nav click
    document.getElementById('nav-hr-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        showHrView();
    });

    // Refresh
    document.getElementById('hr-refresh-btn')?.addEventListener('click', fetchHrData);

    // Month / State filters
    document.getElementById('hr-month-select')?.addEventListener('change', fetchHrData);
    document.getElementById('hr-state-filter')?.addEventListener('change', fetchHrData);

    // Leave status filter
    document.getElementById('hr-leave-status-filter')?.addEventListener('change', (e) => {
        hrLeaveReqStatus = e.target.value;
        hrLeaveReqPage   = 1;
        fetchHrData();
    });

    // Pagination
    document.getElementById('hr-leave-prev-btn')?.addEventListener('click', () => {
        if (hrLeaveReqPage > 1) { hrLeaveReqPage--; fetchHrData(); }
    });
    document.getElementById('hr-leave-next-btn')?.addEventListener('click', () => {
        if (hrLeaveReqPage * hrLeaveReqLimit < hrLeaveReqTotal) { hrLeaveReqPage++; fetchHrData(); }
    });

    // Exports
    document.getElementById('hr-export-leaves-btn')?.addEventListener('click', exportHrLeaves);
    document.getElementById('hr-export-lwp-btn')?.addEventListener('click', exportHrLwp);

    // Default month to current
    const ms = document.getElementById('hr-month-select');
    if (ms) {
        const now = new Date();
        const val = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        if ([...ms.options].some(o => o.value === val)) ms.value = val;
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: PAYMENT MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

function payApiBase() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://127.0.0.1:5000/api/v1/dashboard' : '/api/v1/dashboard';
}

// ── INR formatter ────────────────────────────────────────────────────────────
function fmtInr(n) {
    if (n == null) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

// ── State ────────────────────────────────────────────────────────────────────
let payPage     = 1;
const payLimit  = 20;
let payTotal    = 0;
let payData     = [];

// ── Director Dashboard: Vendor Payment Distribution ──────────────────────────
async function fetchDirectorPaymentAnalytics() {
    try {
        const base = payApiBase();
        const [distRes, costRes] = await Promise.all([
            fetch(`${base}/vendor-payment-distribution`).then(r => r.json()),
            fetch(`${base}/operations-cost`).then(r => r.json())
        ]);

        // Pie chart
        renderVendorPaymentChart(distRes);

        // Operations cost table
        renderOperationsCostTable(costRes.data || []);

    } catch (err) {
        console.error('Payment analytics fetch failed:', err);
    }
}

function renderVendorPaymentChart(data) {
    const chartEl = document.getElementById('dir-vendor-payment-chart');
    const emptyEl = document.getElementById('dir-vendor-payment-empty');
    if (!chartEl) return;

    const withPo    = data.withPo    || { count: 0, amount: 0 };
    const withoutPo = data.withoutPo || { count: 0, amount: 0 };

    if (withPo.count === 0 && withoutPo.count === 0) {
        chartEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = '';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    chartEl.style.display = '';

    if (dirVendorPayChart) {
        dirVendorPayChart.destroy();
        dirVendorPayChart = null;
    }

    dirVendorPayChart = new ApexCharts(chartEl, {
        chart: { type: 'pie', height: 200, fontFamily: "'Public Sans', sans-serif" },
        labels: [
            `With PO (${fmtInr(withPo.amount)})`,
            `Without PO (${fmtInr(withoutPo.amount)})`
        ],
        series: [withPo.amount, withoutPo.amount],
        colors: ['#6366f1', '#10b981'],
        legend: { position: 'right', fontSize: '12px' },
        tooltip: {
            y: { formatter: v => fmtInr(v) }
        },
        dataLabels: {
            formatter: (val) => val.toFixed(1) + '%'
        }
    });
    dirVendorPayChart.render();
}

function renderOperationsCostTable(rows) {
    const tbody = document.getElementById('dir-operations-cost-tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No completed payment data available</td></tr>`;
        return;
    }

    // Push "Unknown" site rows to the end
    const sorted = [...rows].sort((a, b) => {
        const aUnk = !a.siteName || a.siteName === 'Unknown Site';
        const bUnk = !b.siteName || b.siteName === 'Unknown Site';
        if (aUnk && !bUnk) return 1;
        if (!aUnk && bUnk) return -1;
        return 0;
    });

    tbody.innerHTML = sorted.map(r => `
        <tr>
            <td><strong>${r.siteName || 'Unknown'}</strong></td>
            <td>${r.project || '—'}</td>
            <td>${r.state  || '—'}</td>
            <td style="text-align:right; font-weight:700; color:#1e1b4b;">${fmtInr(r.totalPayments)}</td>
        </tr>
    `).join('');
    makeSortable('dir-operations-cost-tbody');
}

// ── Vendor Payment Analysis ──────────────────────────────────────────────────
let vpaCache = [];

async function fetchVendorPaymentAnalysis() {
    const tbody = document.getElementById('vpa-table-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Loading…</td></tr>`;
    try {
        const mode = document.getElementById('vpa-mode-filter')?.value || 'all';
        const url  = `${payApiBase()}/payments/analysis?mode=${encodeURIComponent(mode)}`;
        const res  = await fetch(url).then(r => r.json());
        vpaCache   = res.data || [];
        renderVendorPaymentAnalysis(vpaCache);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#ef4444;">Failed to load payment data.</td></tr>`;
        console.error('[VPA]', err);
    }
}

function renderVendorPaymentAnalysis(rows) {
    const tbody   = document.getElementById('vpa-table-tbody');
    const totalBar = document.getElementById('vpa-grand-total-bar');
    const totalAmt = document.getElementById('vpa-grand-total-amount');
    if (!tbody) return;

    // Apply status filter (client-side)
    const statusFilter = document.getElementById('vpa-status-filter')?.value || 'all';
    const filtered = statusFilter === 'all' ? rows : rows.filter(r => (r.status || '').toLowerCase() === statusFilter.toLowerCase());

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No payment records found</td></tr>`;
        if (totalBar) totalBar.style.display = 'none';
        return;
    }

    const statusBadge = s => {
        const lower = (s || '').toLowerCase();
        const color = lower === 'completed' ? '#10b981' : '#f59e0b';
        return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">${s || '—'}</span>`;
    };

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td><strong>${r.vendorName || '—'}</strong></td>
            <td style="text-align:right;font-weight:700;color:#1e1b4b;">${fmtInr(r.amount || 0)}</td>
            <td>${r.createdByName || '—'}</td>
            <td>${r.accountantName || '—'}</td>
            <td style="text-align:center;">${r.completedAt || '—'}</td>
            <td style="text-align:center;">${statusBadge(r.status)}</td>
        </tr>`).join('');

    // Grand total — always-visible bar below the scroll area
    const grandTotal = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);
    if (totalBar) totalBar.style.display = 'flex';
    if (totalAmt) totalAmt.textContent = fmtInr(grandTotal);
    makeSortable('vpa-table-tbody');
}

async function exportVendorPaymentExcel() {
    if (!vpaCache.length) { alert('No data to export.'); return; }
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Vendor Payment Analysis');

    worksheet.columns = [
        { header: 'Request Name',  key: 'requestName',    width: 20 },
        { header: 'Customer Name', key: 'customerName',   width: 26 },
        { header: 'Site Name',     key: 'siteName',       width: 26 },
        { header: 'Amount (INR)', key: 'amount',          width: 16 },
        { header: 'Type',          key: 'requestMode',    width: 16 },
        { header: 'Created By',    key: 'createdByName',  width: 22 },
        { header: 'Accountant',    key: 'accountantName', width: 22 }
    ];

    vpaCache.forEach(r => worksheet.addRow({
        requestName:    r.requestName    || '',
        customerName:   r.customerName   || '',
        siteName:       r.siteName       || '',
        amount:         r.amount         || 0,
        requestMode:    r.requestMode    || '',
        createdByName:  r.createdByName  || '',
        accountantName: r.accountantName || ''
    }));

    const hdr = worksheet.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    hdr.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getColumn('amount').numFmt = '₹#,##0';

    await downloadExcelWorkbook(workbook, `VendorPaymentAnalysis_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Director Employee-wise Leave Table ────────────────────────────────────────
let dirLeavePage  = 1;
const dirLeaveLimit = 20;
let dirLeaveTotal = 0;
let dirLeaveCache = [];

async function fetchDirectorLeaveTable() {
    const tbody = document.getElementById('dir-leave-table-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Loading…</td></tr>`;

    try {
        const month = document.getElementById('dir-leave-month-filter')?.value || 'all';
        const emp   = document.getElementById('dir-leave-emp-filter')?.value   || 'all';
        const type  = document.getElementById('dir-leave-type-filter')?.value  || 'all';
        const url   = `${payApiBase()}/employee-leaves?month=${encodeURIComponent(month)}&employeeId=${encodeURIComponent(emp)}&type=${encodeURIComponent(type)}&page=${dirLeavePage}&limit=${dirLeaveLimit}`;
        const res   = await fetch(url).then(r => r.json());
        const data  = res.data || {};

        dirLeaveTotal = data.total || 0;
        dirLeaveCache = data.records || [];

        // Populate filter dropdowns (only on first load)
        const empSel  = document.getElementById('dir-leave-emp-filter');
        const typeSel = document.getElementById('dir-leave-type-filter');
        if (empSel && empSel.options.length <= 1 && data.employees?.length) {
            data.employees.forEach(e => {
                const o = document.createElement('option');
                o.value = e.id; o.textContent = e.name;
                empSel.appendChild(o);
            });
        }
        if (typeSel && typeSel.options.length <= 1 && data.types?.length) {
            data.types.forEach(t => {
                const o = document.createElement('option');
                o.value = t; o.textContent = t;
                typeSel.appendChild(o);
            });
        }
        // Populate month dropdown (last 12 months) on first load
        const monthSel = document.getElementById('dir-leave-month-filter');
        if (monthSel && monthSel.options.length <= 1) {
            const now = new Date();
            for (let i = 0; i < 13; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                const o   = document.createElement('option');
                o.value = val; o.textContent = val;
                monthSel.appendChild(o);
            }
        }

        renderDirectorLeaveTable(dirLeaveCache);

        const pages   = Math.ceil(dirLeaveTotal / dirLeaveLimit) || 1;
        const pgInfo  = document.getElementById('dir-leave-page-info');
        if (pgInfo) pgInfo.textContent = `Page ${dirLeavePage} of ${pages}`;
        const prevBtn = document.getElementById('dir-leave-prev-btn');
        const nextBtn = document.getElementById('dir-leave-next-btn');
        if (prevBtn) prevBtn.disabled = dirLeavePage <= 1;
        if (nextBtn) nextBtn.disabled = dirLeavePage >= pages;

    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:#ef4444;">Failed to load leave data.</td></tr>`;
        console.error('[DirLeaves]', err);
    }
}

const LEAVE_ABBR = { 'Casual Leave': 'CL', 'Earned Leave': 'EL', 'Earned Leaves': 'EL', 'Loss of Pay': 'LOP', 'Sick Leave': 'SL', 'Bereavement Leave': 'BL' };
function abbrevLeaveType(t) {
    if (!t) return '—';
    return LEAVE_ABBR[t] || LEAVE_ABBR[t.trim()] || t;
}

function renderDirectorLeaveTable(rows) {
    const tbody = document.getElementById('dir-leave-table-tbody');
    if (!tbody) return;
    if (!rows || !rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">No approved leave records found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r => {
        const d = r.startDate ? new Date(r.startDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        return `<tr>
            <td><strong>${r.employeeName || '—'}</strong></td>
            <td><span style="padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(99,102,241,0.12);color:#6366f1;">${abbrevLeaveType(r.type)}</span></td>
            <td>${d}</td>
            <td style="text-align:center;font-weight:600;">${r.duration ?? '—'}</td>
        </tr>`;
    }).join('');
    makeSortable('dir-leave-table-tbody');
}

async function exportDirectorLeavesExcel() {
    if (!dirLeaveCache.length) { alert('No data to export.'); return; }
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employee Leaves');

    worksheet.columns = [
        { header: 'Employee Name', key: 'employeeName', width: 26 },
        { header: 'Leave Type',    key: 'type',         width: 14 },
        { header: 'Start Date',    key: 'startDate',    width: 16 },
        { header: 'Duration (Days)', key: 'duration',   width: 14 },
        { header: 'Approved By',   key: 'approvedBy',   width: 22 }
    ];

    dirLeaveCache.forEach(r => worksheet.addRow({
        employeeName: r.employeeName || '',
        type:         abbrevLeaveType(r.type),
        startDate:    r.startDate ? new Date(r.startDate).toLocaleDateString('en-IN') : '',
        duration:     r.duration  || '',
        approvedBy:   r.approvedBy || '—'
    }));

    const hdr = worksheet.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    hdr.alignment = { vertical: 'middle', horizontal: 'center' };

    await downloadExcelWorkbook(workbook, `EmployeeLeaves_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── KPI Drilldown Modal — shared across all dashboards ────────────────────────
let hrHeadcountCache  = null;
let sitengKpiCache    = null;
let sitengStatusCache = null;

function openGenericKPIModal(title, columns, rows) {
    const modal    = document.getElementById('director-modal');
    const titleEl  = document.getElementById('director-modal-title');
    const headerEl = document.getElementById('director-modal-table-header');
    const bodyEl   = document.getElementById('director-modal-table-body');
    if (!modal || !bodyEl) return;

    try {
        titleEl.textContent = title;
        headerEl.innerHTML  = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;

        if (!rows || !rows.length) {
            bodyEl.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;color:var(--text-muted);">No records found</td></tr>`;
        } else {
            bodyEl.innerHTML = rows.slice(0, 500).map(r =>
                `<tr>${columns.map((_, i) => `<td>${Object.values(r)[i] ?? '—'}</td>`).join('')}</tr>`
            ).join('');
        }

        // Reset sortable flag so arrows re-attach after each modal open
        const tbl = bodyEl.closest('table');
        if (tbl) delete tbl.dataset.sortable;
        makeSortable('director-modal-table-body');

        modal.style.display = '';  // clear any inline override
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (err) {
        console.error('[KPIModal]', err);
        document.body.style.overflow = '';
    }
}

function openHrKPIModal(type) {
    if (!hrHeadcountCache?.lists) return;
    const titles = { active: 'Active Employees', suspended: 'Suspended Employees', siteEngineers: 'Site Engineers', managers: 'Managers / PMs' };
    const rows   = hrHeadcountCache.lists[type] || [];
    openGenericKPIModal(titles[type] || type, ['Name', 'Designation'], rows.map(r => ({ name: r.name, designation: r.designation })));
}

function openSitengKPIModal(type) {
    if (!sitengKpiCache?.lists) return;
    const titles = { targetSites: 'All Target Sites', doneSites: 'Completed Sites', visibilitySites: 'Active / Visibility Sites', totalFieldForce: 'Total Field Force', deployedManpower: 'Deployed Today' };
    const lists  = sitengKpiCache.lists;
    const isSite = ['targetSites', 'doneSites', 'visibilitySites'].includes(type);
    const rows   = lists[type] || [];
    const cols   = isSite ? ['Site Name', 'State', 'District', 'Status'] : ['Name', 'Designation', 'Manager'];
    const mapped = isSite ? rows.map(r => ({ name: r.name, state: r.state, district: r.district, status: r.status }))
                          : rows.map(r => ({ name: r.name, designation: r.designation, manager: r.manager }));
    openGenericKPIModal(titles[type] || type, cols, mapped);
}

function openSitengStatusModal(type) {
    if (!sitengStatusCache?.lists) return;
    const titles = { onSite: 'On Site Today', atOffice: 'At Office Today', traveling: 'Travelling Today', onLeave: 'On Leave Today', onLWP: 'On LWP Today', idle: 'Idle Today' };
    const rows = (sitengStatusCache.lists[type] || []).map(r => ({ name: r.name, designation: r.designation }));
    if (!rows.length) { openGenericKPIModal(titles[type] || type, ['Name', 'Designation'], [{ name: 'No records', designation: '' }]); return; }
    openGenericKPIModal(titles[type] || type, ['Name', 'Designation'], rows);
}

function openHrLeaveKPIModal(type) {
    const titles = { pending: 'Pending Leave Requests', approved: 'Approved Leave Requests', rejected: 'Rejected Leave Requests', days: 'Approved Leave Days' };
    const statusMap = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', days: 'Approved' };
    const filterStatus = statusMap[type];
    let rows = hrLeaveReqData || [];
    if (filterStatus) rows = rows.filter(r => (r.status || '').toLowerCase() === filterStatus.toLowerCase());
    const mapped = rows.slice(0, 200).map(r => ({
        name: r.fullName || r.employeeName || '—',
        type: r.leaveType || r.type || '—',
        from: r.startDate || '—',
        to:   r.endDate   || '—',
        status: r.status  || '—'
    }));
    openGenericKPIModal(titles[type] || type, ['Employee', 'Type', 'From', 'To', 'Status'], mapped);
}

function openHrExpenseKPIModal(type) {
    const pending = hrCurrentData?.pending || [];
    const titles  = { pendingClaims: 'Pending Expense Claims', approvedAmt: 'Approved Expenses', rejectedClaims: 'Rejected Expense Claims', totalClaimed: 'All Expense Claims' };
    let rows = [];
    if (type === 'pendingClaims')  rows = pending.filter(e => (e.status || '').toLowerCase() === 'pending');
    else if (type === 'approvedAmt') rows = pending.filter(e => (e.status || '').toLowerCase() === 'approved');
    else if (type === 'rejectedClaims') rows = pending.filter(e => (e.status || '').toLowerCase() === 'rejected');
    else rows = pending;
    const mapped = rows.slice(0, 200).map(r => ({
        name:   r.employeeName || r.userId || '—',
        type:   r.expenseType  || r.type   || '—',
        amount: r.amount != null ? `₹${Number(r.amount).toLocaleString('en-IN')}` : '—',
        status: r.status || '—'
    }));
    if (!mapped.length) { openGenericKPIModal(titles[type] || type, ['Employee', 'Type', 'Amount', 'Status'], [{ name: 'No records', type: '', amount: '', status: '' }]); return; }
    openGenericKPIModal(titles[type] || type, ['Employee', 'Type', 'Amount', 'Status'], mapped);
}

// ── All DOMContentLoaded event listeners ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Vendor Payment Analysis
    document.getElementById('vpa-mode-filter')?.addEventListener('change', fetchVendorPaymentAnalysis);
    document.getElementById('vpa-status-filter')?.addEventListener('change', () => renderVendorPaymentAnalysis(vpaCache));
    document.getElementById('vpa-export-btn')?.addEventListener('click', exportVendorPaymentExcel);

    // Director expense export (mirrored button in director dashboard)
    document.getElementById('export-expenses-btn-dir')?.addEventListener('click', exportCustomerExpensesList);

    // Director Employee Leave table
    document.getElementById('dir-leave-month-filter')?.addEventListener('change', () => { dirLeavePage = 1; fetchDirectorLeaveTable(); });
    document.getElementById('dir-leave-emp-filter')?.addEventListener('change',   () => { dirLeavePage = 1; fetchDirectorLeaveTable(); });
    document.getElementById('dir-leave-type-filter')?.addEventListener('change',  () => { dirLeavePage = 1; fetchDirectorLeaveTable(); });
    document.getElementById('dir-leave-prev-btn')?.addEventListener('click', () => { if (dirLeavePage > 1) { dirLeavePage--; fetchDirectorLeaveTable(); } });
    document.getElementById('dir-leave-next-btn')?.addEventListener('click', () => { if (dirLeavePage * dirLeaveLimit < dirLeaveTotal) { dirLeavePage++; fetchDirectorLeaveTable(); } });
    document.getElementById('dir-leave-export-btn')?.addEventListener('click', exportDirectorLeavesExcel);

    // Siteng KPI cards
    const seCardsMap = {
        'card-se-target-sites':     'targetSites',
        'card-se-done-sites':       'doneSites',
        'card-se-visibility-sites': 'visibilitySites',
        'card-se-deployed':         'deployedManpower'
    };
    Object.entries(seCardsMap).forEach(([cardId, type]) => {
        document.getElementById(cardId)?.addEventListener('click', () => openSitengKPIModal(type));
    });

    // Siteng activity status cards (from engineer-status-today)
    const seStatusMap = {
        'card-se-act-onsite':    'onSite',
        'card-se-act-atoffice':  'atOffice',
        'card-se-act-onleave':   'onLeave',
        'card-se-act-lwp':       'onLWP',
        'card-se-act-idle':      'idle'
    };
    Object.entries(seStatusMap).forEach(([cardId, type]) => {
        document.getElementById(cardId)?.addEventListener('click', () => openSitengStatusModal(type));
    });

    // HR headcount KPI cards (all clickable)
    const hrCardsMap = {
        'card-hr-total-active':   'active',
        'card-hr-suspended':      'suspended',
        'card-hr-site-engineers': 'siteEngineers',
        'card-hr-managers':       'managers'
    };
    Object.entries(hrCardsMap).forEach(([cardId, type]) => {
        document.getElementById(cardId)?.addEventListener('click', () => openHrKPIModal(type));
    });

    // HR leave KPI cards
    const hrLeaveCardsMap = {
        'card-hr-leave-pending':  'pending',
        'card-hr-leave-approved': 'approved',
        'card-hr-leave-rejected': 'rejected',
        'card-hr-leave-days':     'days'
    };
    Object.entries(hrLeaveCardsMap).forEach(([cardId, type]) => {
        document.getElementById(cardId)?.addEventListener('click', () => openHrLeaveKPIModal(type));
    });

    // HR expense KPI cards
    const hrExpCardsMap = {
        'card-hr-exp-pending':  'pendingClaims',
        'card-hr-exp-approved': 'approvedAmt',
        'card-hr-exp-rejected': 'rejectedClaims',
        'card-hr-exp-total':    'totalClaimed'
    };
    Object.entries(hrExpCardsMap).forEach(([cardId, type]) => {
        document.getElementById(cardId)?.addEventListener('click', () => openHrExpenseKPIModal(type));
    });

    // Field Alerts filters
    ['siteng-alert-pm-filter', 'siteng-alert-project-filter', 'siteng-alert-region-filter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {});
    });
});
