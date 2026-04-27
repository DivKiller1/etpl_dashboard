const express = require('express');
const router = express.Router();
const ARCMaster = require('../models/ARCMaster');
const { Role, LeaveType } = require('../models/HRMasters');
const { SurveyTemplate, BOQTemplate } = require('../models/Templates');
const { Site, BOQ, Holiday } = require('../models/MiscModels');

// Helper to create CRUD routes for a model
const createCRUD = (model, name) => {
    router.get(`/${name}`, async (req, res) => {
        try {
            const data = await model.find();
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });
};

createCRUD(ARCMaster, 'arc');
createCRUD(Role, 'roles');
createCRUD(LeaveType, 'leave-types');
createCRUD(SurveyTemplate, 'survey-templates');
createCRUD(BOQTemplate, 'boq-templates');
createCRUD(Site, 'sites');
createCRUD(BOQ, 'boqs');
createCRUD(Holiday, 'holidays');

module.exports = router;
