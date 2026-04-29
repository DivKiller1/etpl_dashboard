const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    // Section 1: Basic Information
    employeeId: { type: String, required: true, unique: true },
    role: { type: String, required: true }, // Admin, HR, Manager, Employee, Technician
    designation: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    companyEmail: String,
    personalEmail: { type: String, required: true },
    phone: { type: String, required: true },
    dob: { type: Date, required: true },

    // Section 2: Permanent Address & Emergency Contact
    permanentAddress: {
        houseNo: String,
        street: String,
        state: String,
        district: String,
        country: { type: String, default: 'India' },
        pin: String
    },
    emergencyContact: {
        name: String,
        phone: String
    },

    // Section 3: Current Address & Personal Details
    currentAddress: {
        houseNo: String,
        street: String,
        state: String,
        district: String,
        country: { type: String, default: 'India' },
        pin: String
    },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    profilePhoto: String, // String path

    // Section 4: KYC & Bank Details
    kyc: {
        pan: { type: String, required: true },
        aadhar: { type: String, required: true }
    },
    bank: {
        accountNumber: { type: String, required: true },
        bankName: { type: String, required: true },
        ifsc: { type: String, required: true },
        accountHolder: { type: String, required: true }
    },
    workDetails: {
        baseLocation: String,
        bloodGroup: String,
        pfNumber: String,
        uanNumber: String,
        insurancePolicy: String
    },

    // Section 5: Family Details
    family: {
        fatherName: String,
        motherName: String,
        spouseName: String,
        fatherContact: String,
        motherContact: String,
        spouseContact: String
    },

    // Section 6: Compensation
    compensation: {
        lastIncrementDate: Date,
        components: [
            {
                name: String, // Basic, HRA, etc.
                amount: Number
            }
        ]
    },

    // Section 7: Education Details
    education: [
        {
            qualification: String,
            degree: String,
            schoolCollege: String,
            discipline: String
        }
    ],

    // Section 8: Manager Details
    manager: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
    },

    // Section 9: Company Assets
    assets: [
        {
            assetType: String,
            serialNumber: String,
            description: String
        }
    ],

    status: { type: String, enum: ['Active', 'Inactive', 'On-Leave'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
