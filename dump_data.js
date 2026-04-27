const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: './backend/.env' });

const Employee = require('./backend/models/Employee');
const Expense = require('./backend/models/Expense');
const LeaveRequest = require('./backend/models/LeaveRequest');
const Customer = require('./backend/models/Customer');
const Vendor = require('./backend/models/Vendor');
const { Site } = require('./backend/models/MiscModels');

async function dump() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/etpl_dashboard');
        console.log('Connected to MongoDB');

        const dataDir = path.join(__dirname, 'backend', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

        const models = {
            employees: Employee,
            expenses: Expense,
            leaverequests: LeaveRequest,
            customers: Customer,
            vendors: Vendor,
            sites: Site
        };

        for (const [name, model] of Object.entries(models)) {
            const data = await model.find({});
            fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));
            console.log(`Dumped ${data.length} records for ${name}`);
        }

        console.log('Data dump complete!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

dump();
