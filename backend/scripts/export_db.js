const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const exportDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/etpl');
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const backup = {};

        for (const coll of collections) {
            const data = await db.collection(coll.name).find({}).toArray();
            backup[coll.name] = data;
            console.log(`Exported ${data.length} records from ${coll.name}`);
        }

        const backupPath = path.join(__dirname, '../etpl_backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
        console.log(`Backup saved to ${backupPath}`);
        
    } catch (err) {
        console.error('Export failed:', err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

exportDB();
