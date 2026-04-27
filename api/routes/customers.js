const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        let query = {};

        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { customerId: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const skip = (page - 1) * limit;
        const total = await Customer.countDocuments(query);
        const results = await Customer.find(query).skip(skip).limit(parseInt(limit));

        res.status(200).json({ success: true, count: results.length, total, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
