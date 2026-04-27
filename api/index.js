const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to database (only for local dev/seeding)
if (process.env.NODE_ENV !== 'production') {
    connectDB();
}

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Dev logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Route files
const dashboardRoutes = require('./routes/dashboard');
const employeeRoutes = require('./routes/employees');
const expenseRoutes = require('./routes/expenses');
const leaveRoutes = require('./routes/leaves');
const customerRoutes = require('./routes/customers');
const vendorRoutes = require('./routes/vendors');
const masterRoutes = require('./routes/masters');

// Mount routers
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/masters', masterRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    // server.close(() => process.exit(1));
});
