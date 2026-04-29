const mongoose = require('mongoose');

const surveyQuestionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    answerType: { type: String, enum: ['Text', 'Radio', 'Checkbox', 'Dropdown', 'File'], required: true },
    required: { type: Boolean, default: false }
});

const surveySectionSchema = new mongoose.Schema({
    sectionTitle: { type: String, required: true },
    questions: [surveyQuestionSchema]
});

const surveyTemplateSchema = new mongoose.Schema({
    title: { type: String, required: true },
    customer: { type: String, required: true }, // Links to Customer ID
    sections: [surveySectionSchema]
}, { timestamps: true });

const boqItemSchema = new mongoose.Schema({
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    unitPrice: { type: Number, required: true }
});

const boqTemplateSchema = new mongoose.Schema({
    templateName: { type: String, required: true },
    customer: { type: String, required: true }, // Customer ID
    items: [boqItemSchema]
}, { timestamps: true });

module.exports = {
    SurveyTemplate: mongoose.model('SurveyTemplate', surveyTemplateSchema),
    BOQTemplate: mongoose.model('BOQTemplate', boqTemplateSchema)
};
