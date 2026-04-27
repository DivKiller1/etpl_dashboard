const express = require('express');
const router = express.Router();
const LeaveRequest = require('../models/LeaveRequest');

router.get('/', async (req, res) => {
    try {
        const { timeframe, status, type, page = 1, limit = 10 } = req.query;
        let query = {};

        if (timeframe) query.timeframe = timeframe;
        if (status) query.status = status;
        if (type) query.type = type;

        const skip = (page - 1) * limit;
        const total = await LeaveRequest.countDocuments(query);
        const leaves = await LeaveRequest.find(query).sort('-startDate').skip(skip).limit(parseInt(limit));

        res.status(200).json({
            success: true,
            count: leaves.length,
            total,
            data: leaves
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
