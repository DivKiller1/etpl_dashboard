const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');

// @desc    Get all employees with pagination and searching
// @route   GET /api/v1/employees
router.get('/', async (req, res) => {
    try {
        let query;

        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude
        const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
        removeFields.forEach(param => delete reqQuery[param]);

        let queryStr = JSON.stringify(reqQuery);
        query = Employee.find(JSON.parse(queryStr));

        // Search by name if search term exists
        if (req.query.search) {
            query = query.find({
                $or: [
                    { firstName: { $regex: req.query.search, $options: 'i' } },
                    { lastName: { $regex: req.query.search, $options: 'i' } },
                    { employeeId: { $regex: req.query.search, $options: 'i' } }
                ]
            });
        }

        // Selection
        if (req.query.select) {
            const fields = req.query.select.split(',').join(' ');
            query = query.select(fields);
        }

        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-createdAt');
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Employee.countDocuments();

        query = query.skip(startIndex).limit(limit);

        const results = await query;

        // Pagination result
        const pagination = {};
        if (endIndex < total) {
            pagination.next = { page: page + 1, limit };
        }
        if (startIndex > 0) {
            pagination.prev = { page: page - 1, limit };
        }

        res.status(200).json({
            success: true,
            count: results.length,
            pagination,
            data: results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
