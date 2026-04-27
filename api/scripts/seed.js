const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Expense = require('../models/Expense');
const LeaveRequest = require('../models/LeaveRequest');
const { Site, BOQ, Holiday, DashboardSummary } = require('../models/MiscModels');
const { Role, LeaveType } = require('../models/HRMasters');
const ARCMaster = require('../models/ARCMaster');
const { SurveyTemplate, BOQTemplate } = require('../models/Templates');

const indianNames = [
    "Arjun Sharma", "Priya Patel", "Rahul Gupta", "Anjali Singh", "Suresh Kumar",
    "Deepika Reddy", "Amit Verma", "Sunita Rao", "Vikram Malhotra", "Meera Iyer",
    "Rohan Deshmukh", "Sneha Kulkarni", "Abhishek Roy", "Pooja Banerjee", "Karthik Nair",
    "Divya Joshi", "Sandeep Mishra", "Kavita Yadav", "Manoj Tiwari", "Swati Chawla",
    "Rajesh Khanna", "Aarti Kapoor", "Sanjay Dutt", "Neelam Kothari", "Alok Nath",
    "Juhi Chawla", "Rishi Kapoor", "Dimple Kapadia", "Anil Kapoor", "Sridevi Kapoor",
    "Salman Khan", "Shahrukh Khan", "Aamir Khan", "Kajol Devgn", "Madhuri Dixit",
    "Akshay Kumar", "Twinkle Khanna", "Saif Ali Khan", "Kareena Kapoor", "Karisma Kapoor",
    "Hrithik Roshan", "Rani Mukerji", "Preity Zinta", "Aishwarya Rai", "Abhishek Bachchan",
    "Priyanka Chopra", "Deepika Padukone", "Ranbir Kapoor", "Ranveer Singh", "Alia Bhatt"
];

const cities = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Surat", "Pune", "Jaipur"];
const states = ["Maharashtra", "Delhi", "Karnataka", "Telangana", "Gujarat", "Tamil Nadu", "West Bengal", "Gujarat", "Maharashtra", "Rajasthan"];
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seed = async () => {
    try {
        await connectDB();

        // Clear existing data
        await Promise.all([
            Customer.deleteMany({}),
            Vendor.deleteMany({}),
            Employee.deleteMany({}),
            Attendance.deleteMany({}),
            Expense.deleteMany({}),
            LeaveRequest.deleteMany({}),
            Site.deleteMany({}),
            BOQ.deleteMany({}),
            Holiday.deleteMany({}),
            DashboardSummary.deleteMany({}),
            Role.deleteMany({}),
            LeaveType.deleteMany({}),
            ARCMaster.deleteMany({}),
            SurveyTemplate.deleteMany({}),
            BOQTemplate.deleteMany({})
        ]);

        console.log('Database cleared. Starting HIGH-DIVERSITY seeding...');

        // 1. Seed Roles
        await Role.insertMany([
            { name: 'Admin', description: 'Full system access', level: 1 },
            { name: 'HR', description: 'Human resources management', level: 2 },
            { name: 'Manager', description: 'Approvals & Team management', level: 2 },
            { name: 'Accountant', description: 'Financial processing', level: 2 },
            { name: 'Employee', description: 'Standard access', level: 3 },
            { name: 'Technician', description: 'Field work access', level: 3 }
        ]);

        // 2. Seed Employees (50)
        const employees = [];
        for (let i = 1; i <= 50; i++) {
            const fullName = indianNames[i - 1];
            const [firstName, lastName] = fullName.split(' ');
            employees.push({
                employeeId: `EMP${String(i).padStart(3, '0')}`,
                role: getRandom(['Manager', 'Employee', 'Technician']),
                designation: getRandom(['Site Engineer', 'Accountant', 'HR Specialist']),
                firstName,
                lastName,
                personalEmail: `${firstName.toLowerCase()}@personal.com`,
                companyEmail: `${firstName.toLowerCase()}@etpl.in`,
                phone: `91${getRandomInt(7000000000, 9999999999)}`,
                dob: new Date(1985 + getRandomInt(0, 15), getRandomInt(0, 11), 10),
                permanentAddress: { houseNo: `${i}`, street: 'Street', state: 'Maharashtra', district: 'Mumbai', pin: '400001' },
                kyc: { pan: `ABCDE${i}F`, aadhar: `9999${i}8888` },
                bank: { accountNumber: `9123${i}`, bankName: 'HDFC', ifsc: 'HDFC001', accountHolder: fullName }
            });
        }
        const createdEmployees = await Employee.insertMany(employees);

        // 3. Seed Customers & Sites (50 each)
        const customerList = [];
        for (let i = 1; i <= 50; i++) {
            customerList.push({
                customerId: `CUST${String(i).padStart(3, '0')}`,
                name: `${indianNames[i-1]} Infra Ltd`,
                email: `ops@customer${i}.in`,
                phone: `99887766${String(i).padStart(2,'0')}`,
                houseNo: `${i}`, street: 'Business Hub', state: 'Maharashtra', district: 'Mumbai', pinCode: '400001',
                pan: `PAN${i}`, gst: `22AAAAA0000A1Z5`, aadhar: `123456${i}`,
                status: 'active'
            });
        }
        await Customer.insertMany(customerList);

        const siteList = [];
        for (let i = 1; i <= 50; i++) {
            siteList.push({
                siteId: `SITE${String(i).padStart(3, '0')}`,
                name: `Site ${cities[i%10]} ${i}`,
                customerId: `CUST${String(getRandomInt(1, 50)).padStart(3, '0')}`,
                state: states[i%10],
                district: cities[i%10],
                location: 'Project Area',
                status: getRandom(['Active', 'Completed'])
            });
        }
        await Site.insertMany(siteList);

        // Seed Vendors (50)
        const vendorList = [];
        for (let i = 1; i <= 50; i++) {
            vendorList.push({
                vendorId: `VND${String(i).padStart(3, '0')}`,
                name: `${getRandom(['Sharp', 'Speed', 'Quality'])} Engineering`,
                email: `support@vendor${i}.in`,
                phone: `776655${i}00`,
                vendorType: getRandom(['Civil', 'Electric', 'Labor', 'Other']),
                pan: `PANV${i}`, gst: `22AAA0000Z`, aadhar: `112233${i}`,
                bankDetails: {
                    accountHolder: 'Vendor Core', bankName: 'Standard Bank', ifsc: 'STND001', accountNumber: `123${i}`
                }
            });
        }
        await Vendor.insertMany(vendorList);

        // 4. HIGH DIVERSITY EXPENSES (300 records)
        const categories = ['Travel', 'Meals', 'Accommodation', 'Supplies', 'Other'];
        const expenses = [];
        for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
            const timeframe = months[monthIdx];
            // 25 expenses per month to show good trends
            for (let i = 0; i < 25; i++) {
                const day = getRandomInt(1, 28);
                const actual = getRandomInt(1000, 15000);
                expenses.push({
                    expenseId: `EXP-${timeframe}-${i}`,
                    employeeId: createdEmployees[getRandomInt(0, 49)].employeeId,
                    date: new Date(`2026-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
                    category: getRandom(categories),
                    actualAmount: actual,
                    approvedAmount: getRandom([null, actual, actual * 0.8]),
                    description: `Reimbursement for Project Work ${i}`,
                    status: getRandom(['Pending', 'Approved', 'Paid', 'Rejected']),
                    timeframe: timeframe
                });
            }
        }
        await Expense.insertMany(expenses);

        // 5. HIGH DIVERSITY LEAVES (120 records)
        const leaveRequests = [];
        for (let i = 1; i <= 120; i++) {
            const startMonth = getRandomInt(1, 12);
            const startDay = getRandomInt(1, 15);
            leaveRequests.push({
                employeeId: createdEmployees[getRandomInt(0, 49)].employeeId,
                type: getRandom(['Sick', 'Casual', 'Vacation']),
                startDate: new Date(`2026-${String(startMonth).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`),
                endDate: new Date(`2026-${String(startMonth).padStart(2,'0')}-${String(startDay+2).padStart(2,'0')}`),
                reason: 'Personal work / Medical',
                status: getRandom(['Pending', 'Approved', 'Rejected']),
                timeframe: months[startMonth - 1]
            });
        }
        await LeaveRequest.insertMany(leaveRequests);

        // 6. ATTENDANCE (600 records)
        const attendance = [];
        for (let empIdx = 0; empIdx < 20; empIdx++) { // 20 employees
            const emp = createdEmployees[empIdx];
            for (let day = 1; day <= 30; day++) { // 30 days of data
                attendance.push({
                    employeeId: emp.employeeId,
                    employeeName: `${emp.firstName} ${emp.lastName}`,
                    date: new Date(`2026-03-${String(day).padStart(2,'0')}`),
                    checkIn: "09:00",
                    checkOut: "18:00",
                    workingHours: 9,
                    status: getRandom(['Present', 'Present', 'Present', 'Absent', 'On-Leave']),
                    timeframe: '2026-03'
                });
            }
        }
        await Attendance.insertMany(attendance);

        // 7. Dashboard Summaries (Aggregate monthly for the graph)
        const summaries = [];
        for (let m = 0; m < 12; m++) {
            const tf = months[m];
            const monthlyExpenses = expenses.filter(e => e.timeframe === tf);
            const totalExp = monthlyExpenses.reduce((sum, e) => sum + e.actualAmount, 0);
            summaries.push({
                timeframe: tf,
                totalEmployees: 50,
                totalExpenses: totalExp,
                pendingLeaves: 10,
                pendingExpenses: 15,
                totalCustomers: 50,
                totalVendors: 20,
                totalSites: 50
            });
        }
        await DashboardSummary.insertMany(summaries);

        console.log('HIGH-DIVERSITY seeding completed successfully!');
        process.exit();
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seed();
