const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./_lib/utils/db');

const app = express();
connectDB();

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

const dashboardRoutes = require('./_lib/routes/dashboard');
app.use('/api/v1/dashboard', dashboardRoutes);

// Root redirect
app.get('/', (req, res) => res.redirect('/api/v1/dashboard/data'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
