const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./_lib/utils/db');

const app = express();
connectDB();

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

const authRoutes = require('./_lib/routes/auth');
app.use('/api/v1/auth', authRoutes);

const dashboardRoutes = require('./_lib/routes/dashboard');
app.use('/api/v1/dashboard', dashboardRoutes);

const sitengRoutes = require('./_lib/routes/siteng');
app.use('/api/v1/siteng', sitengRoutes);

const hrRoutes = require('./_lib/routes/hr');
app.use('/api/v1/hr', hrRoutes);

// Root redirect
app.get('/', (req, res) => res.redirect('/api/v1/dashboard/data'));

// Only start the HTTP server when running locally (not on Vercel serverless)
if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
