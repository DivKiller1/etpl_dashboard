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

    // 2. Reconstruct Leave Transactions contiguous grouping
    const employees = [...new Set(dailyAttendanceDb.map(r => r.employeeName))];
    employees.forEach(empName => {
        const empLeaves = dailyAttendanceDb
            .filter(r => r.employeeName === empName && r.status === 'Leave')
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let currentLeaveGroup = [];
        empLeaves.forEach(record => {
            if (currentLeaveGroup.length === 0) {
                currentLeaveGroup.push(record);
            } else {
                const prevRecord = currentLeaveGroup[currentLeaveGroup.length - 1];
                const diffDays = (new Date(record.date) - new Date(prevRecord.date)) / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    currentLeaveGroup.push(record);
                } else {
                    addLeaveTransaction(empName, currentLeaveGroup);
                    currentLeaveGroup = [record];
                }
            }
        });
        if (currentLeaveGroup.length > 0) {
            addLeaveTransaction(empName, currentLeaveGroup);
        }
    });

    // Helper to push processed leave ranges
    function addLeaveTransaction(name, records) {
        const start = records[0].date;
        const end = records[records.length - 1].date;
        const duration = records.length;

        // Deterministically assign leave type
        const leaveTypes = ["SL", "LOP", "CL", "EL", "BL"];
        const hash = (name.charCodeAt(0) + start.charCodeAt(start.length - 1)) % leaveTypes.length;
        const type = leaveTypes[hash];

        leaveTransactions.push({
            employeeName: name,
            startDate: start,
            endDate: end,
            duration: duration,
            type: type
        });
    }

    // 3. Reconstruct Daily Expenses (distributed daily to support month/date picker reactivity)
    if (customerExpenses) {
        customerExpenses.forEach(cust => {
            const customerName = cust.name;
            const sites = cust.sites || [];
            const types = cust.types || [];

            const totalBudget = cust.total;
            const uniqueDates = [...new Set(dailyAttendanceDb.map(r => r.date))];
            if (uniqueDates.length === 0) return;

            let remainingBudget = totalBudget;
            let transactionId = 0;

            while (remainingBudget > 0 && uniqueDates.length > 0) {
                const dateIndex = (customerName.charCodeAt(0) + transactionId) % uniqueDates.length;
                const targetDate = uniqueDates[dateIndex];

                const siteIndex = (customerName.charCodeAt(1) + transactionId) % sites.length;
                const targetSite = sites[siteIndex]?.name || 'Office';

                const typeIndex = (customerName.charCodeAt(2) + transactionId) % types.length;
                const targetType = types[typeIndex]?.type || 'Other';

                const step = Math.min(remainingBudget, Math.max(100, Math.floor(remainingBudget / 10)));
                const amount = step === remainingBudget ? step : Math.floor(step * (0.8 + (transactionId % 5) * 0.1));

                dailyExpensesDb.push({
                    customerName: customerName,
                    customerId: cust.customerId,
                    date: targetDate,
                    site: targetSite,
                    category: targetType,
                    amount: amount
                });

                remainingBudget -= amount;
                transactionId++;
            }
        });
    }
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
    const leaveCounts = { SL: 0, LOP: 0, CL: 0, EL: 0, BL: 0 };
    leaveData.forEach(l => {
        if (leaveCounts[l.type] !== undefined) {
            leaveCounts[l.type] += l.duration;
        }
    });

    const series = Object.values(leaveCounts);
    const labels = Object.keys(leaveCounts);

    const fullNames = {
        SL: "Sick Leave",
        LOP: "Loss of Pay",
        CL: "Casual Leave",
        EL: "Earned Leaves",
        BL: "Bereavement Leave"
    };

    const options = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            height: 350,
            events: {
                dataPointSelection: (e, ctx, config) => {
                    const selectedIndex = config.dataPointIndex;
                    const typeLabel = labels[selectedIndex];
                    openLeaveModal(typeLabel);
                }
            }
        },
        colors: ['#ef4444', '#f59e0b', '#6366f1', '#10b981', '#3b82f6'],
        tooltip: {
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                const abrv = w.config.labels[seriesIndex];
                const fullName = fullNames[abrv];
                const val = series[seriesIndex];
                return `<div style="padding: 10px; font-size: 13px;"><strong>${fullName} (${abrv})</strong>: ${val} Days</div>`;
            }
        },
        legend: {
            position: 'bottom',
            formatter: (val) => `${val}`
        },
        responsive: [{
            breakpoint: 480,
            options: { legend: { position: 'bottom' } }
        }]
    };

    if (chartLeaveDistribution) chartLeaveDistribution.destroy();

    if (series.every(v => v === 0)) {
        document.querySelector("#leave-distribution-chart").innerHTML = '<div style="padding: 100px; text-align: center; color: #888;">No leave distribution records</div>';
        return;
    }

    document.querySelector("#leave-distribution-chart").innerHTML = '';
    chartLeaveDistribution = new ApexCharts(document.querySelector("#leave-distribution-chart"), options);
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

    const chartWidth = Math.max(800, customers.length * 80);

    const options = {
        series: seriesData,
        chart: {
            type: 'bar',
            height: 350,
            width: chartWidth,
            stacked: true,
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '55%',
                borderRadius: 4
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

    if (chartCustomerExpenses) chartCustomerExpenses.destroy();

    if (customers.length === 0) {
        document.querySelector("#customer-expenses-chart").innerHTML = '<div style="padding: 100px; text-align: center; color: #888;">No expense data found in the selected range</div>';
        return;
    }

    document.querySelector("#customer-expenses-chart").innerHTML = '';
    chartCustomerExpenses = new ApexCharts(document.querySelector("#customer-expenses-chart"), options);
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
        chart: { type: 'pie', height: 280 },
        legend: { position: 'bottom' },
        tooltip: { y: { formatter: (val) => '₹' + val.toLocaleString('en-IN') } },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6']
    };

    if (chartCustomerSite) chartCustomerSite.destroy();
    if (siteSeries.length > 0) {
        document.querySelector("#customer-site-chart").innerHTML = '';
        chartCustomerSite = new ApexCharts(document.querySelector("#customer-site-chart"), siteOptions);
        chartCustomerSite.render();
    } else {
        document.querySelector("#customer-site-chart").innerHTML = '<div style="padding: 80px; text-align: center; color: #888;">No site data available</div>';
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
        chart: { type: 'pie', height: 280 },
        legend: { position: 'bottom' },
        tooltip: { y: { formatter: (val) => '₹' + val.toLocaleString('en-IN') } },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6']
    };

    if (chartExpenseTypes) chartExpenseTypes.destroy();
    if (typeSeries.some(v => v > 0)) {
        document.querySelector("#expense-types-chart").innerHTML = '';
        chartExpenseTypes = new ApexCharts(document.querySelector("#expense-types-chart"), typeOptions);
        chartExpenseTypes.render();
    } else {
        document.querySelector("#expense-types-chart").innerHTML = '<div style="padding: 80px; text-align: center; color: #888;">No category data available</div>';
    }
}

// Render empty placeholders for breakdowns
function renderEmptyCustomerBreakdownCharts() {
    if (chartCustomerSite) chartCustomerSite.destroy();
    if (chartExpenseTypes) chartExpenseTypes.destroy();
    document.querySelector("#customer-site-chart").innerHTML = '<div style="padding: 80px; text-align: center; color: #888;">No data available</div>';
    document.querySelector("#expense-types-chart").innerHTML = '<div style="padding: 80px; text-align: center; color: #888;">No data available</div>';
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
        legend: { position: 'bottom' }
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

    const fullNames = {
        SL: "Sick Leave",
        LOP: "Loss of Pay",
        CL: "Casual Leave",
        EL: "Earned Leaves",
        BL: "Bereavement Leave"
    };

    title.textContent = `${fullNames[leaveType] || 'Leave'} Details (${leaveType})`;
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

        // Remove the loading screen and display main structure layout
        document.getElementById('dashboard-loading-spinner')?.classList.add('hidden');
        document.getElementById('dashboard-main-content')?.classList.remove('hidden');

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

// Bind all listeners and call initial startup
document.addEventListener('DOMContentLoaded', () => {
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

    // 6. Director Dashboard View toggles
    document.getElementById('nav-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('nav-dashboard').classList.add('active');
        document.getElementById('nav-director-dashboard')?.classList.remove('active');
        document.getElementById('dashboard-main-content').classList.remove('hidden');
        document.getElementById('director-dashboard-view')?.classList.add('hidden');
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) breadcrumb.textContent = 'OPERATIONAL ANALYTICS';
        document.querySelector('.filters-container')?.classList.remove('hidden');
    });

    document.getElementById('nav-director-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('nav-director-dashboard').classList.add('active');
        document.getElementById('nav-dashboard').classList.remove('active');
        document.getElementById('director-dashboard-view')?.classList.remove('hidden');
        document.getElementById('dashboard-main-content').classList.add('hidden');
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) breadcrumb.textContent = 'DIRECTOR ANALYTICS';
        document.querySelector('.filters-container')?.classList.add('hidden');
        fetchDirectorData();
        // Load Google Maps API script asynchronously
        loadGoogleMapsScript();
    });

    document.getElementById('director-date-picker')?.addEventListener('change', () => {
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
        'card-dir-sites-at-risk': { type: 'sitesAtRisk', title: 'Sites At Risk (7d gap)' },
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
        if (e.target === document.getElementById('director-modal')) {
            closeDirectorModal();
        }
    });

    // 8. Initialize layout data loading
    init();
});

// ── SECTION 6: DIRECTOR DASHBOARD CONTROLLER

let dirChartAttendanceTrends = null;
let dirChartWorkforceShare = null;
let directorDataCache = null;

async function fetchDirectorData() {
    const picker = document.getElementById('director-date-picker');
    const targetDate = picker ? picker.value : '2026-06-04';
    
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:5000/api/v1'
        : '/api/v1';

    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/director-data?date=${targetDate}`);
        if (!response.ok) throw new Error('API server returned bad status code');
        const result = await response.json();
        
        directorDataCache = result.data;
        renderDirectorDashboard(directorDataCache);

        // Load and draw map markers
        loadGoogleMapsScript(() => {
            renderGoogleMap(directorDataCache.engineerLocations || []);
        }, directorDataCache.googleMapsApiKey);
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

    // Sites At Risk Table
    const sitesRiskBody = document.getElementById('dir-sites-risk-table-body');
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

    // 4. Render Charts
    renderDirectorCharts(charts);
}

function renderDirectorCharts(chartData) {
    // 30 Days Attendance Trends Chart
    const trendDates = chartData.attendanceTrend.map(t => {
        const d = new Date(t.date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const presentData = chartData.attendanceTrend.map(t => t.present);
    const leaveData = chartData.attendanceTrend.map(t => t.leave);
    const absentData = chartData.attendanceTrend.map(t => t.absent);

    const trendOptions = {
        series: [
            { name: 'Present', data: presentData },
            { name: 'On Leave', data: leaveData },
            { name: 'Absent / Idle', data: absentData }
        ],
        chart: {
            type: 'area',
            height: 350,
            toolbar: { show: false }
        },
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
        xaxis: { categories: trendDates },
        yaxis: { min: 0 },
        legend: { position: 'top' }
    };

    if (dirChartAttendanceTrends) dirChartAttendanceTrends.destroy();
    dirChartAttendanceTrends = new ApexCharts(document.querySelector("#dir-attendance-trends-chart"), trendOptions);
    dirChartAttendanceTrends.render();

    // Workforce Share Donut Chart
    const shareOptions = {
        series: [chartData.workforceDistribution.present, chartData.workforceDistribution.leave, chartData.workforceDistribution.absent],
        labels: ['Present', 'On Leave', 'Absent / Idle'],
        chart: { type: 'donut', height: 350 },
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        legend: { position: 'bottom' }
    };

    if (dirChartWorkforceShare) dirChartWorkforceShare.destroy();
    dirChartWorkforceShare = new ApexCharts(document.querySelector("#dir-workforce-share-chart"), shareOptions);
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
        googleMapInstance = new google.maps.Map(mapElement, {
            center: { lat: 20.5937, lng: 78.9629 }, // Center of India
            zoom: 5,
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

