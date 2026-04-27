const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');

router.get('/', async (req, res) => {
    try {
        const { timeframe, status, category, page = 1, limit = 10, search } = req.query;
        let query = {};

        if (timeframe) query.timeframe = timeframe;
        if (status) query.status = status;
        if (category) query.category = category;
        if (search) query.description = { $regex: search, $options: 'i' };

        const skip = (page - 1) * limit;
        const total = await Expense.countDocuments(query);
        const expenses = await Expense.find(query).sort('-date').skip(skip).limit(parseInt(limit));

        res.status(200).json({
            success: true,
            count: expenses.length,
            total,
            data: expenses
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
