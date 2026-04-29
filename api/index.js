const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./_lib/config/db');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '_lib', '.env') });

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Dev logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Route files (Imported from _lib)
const dashboardRoutes = require('./_lib/routes/dashboard');
const employeeRoutes = require('./_lib/routes/employees');
const expenseRoutes = require('./_lib/routes/expenses');
const leaveRoutes = require('./_lib/routes/leaves');
const customerRoutes = require('./_lib/routes/customers');
const vendorRoutes = require('./_lib/routes/vendors');
const masterRoutes = require('./_lib/routes/masters');

// Mount routers
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/masters', masterRoutes);

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
}

module.exports = app;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    // server.close(() => process.exit(1));
});
