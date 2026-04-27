const fs = require('fs');
const path = require('path');

class JsonModel {
    constructor(name) {
        this.name = name;
        this.data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${name}.json`), 'utf8'));
    }

    async find(query = {}) {
        let results = this.data;
        // Basic filtering if needed (e.g. { status: 'Pending' })
        for (const [key, value] of Object.entries(query)) {
            results = results.filter(item => item[key] === value);
        }
        
        // Chainable helpers
        const chain = {
            data: results,
            sort: function(opts) { return this; }, // Mock sort
            limit: function(n) { this.data = this.data.slice(0, n); return this; },
            skip: function(n) { this.data = this.data.slice(n); return this; },
            then: function(cb) { cb(this.data); return this; }
        };
        return results;
    }

    async countDocuments(query = {}) {
        let results = this.data;
        for (const [key, value] of Object.entries(query)) {
            results = results.filter(item => item[key] === value);
        }
        return results.length;
    }

    async aggregate(pipeline) {
        const groupStep = pipeline.find(p => p.$group);
        if (groupStep) {
            const idField = groupStep.$group._id.replace('$', '');
            const groups = {};
            this.data.forEach(item => {
                const val = item[idField];
                groups[val] = (groups[val] || 0) + 1;
            });
            return Object.entries(groups).map(([id, count]) => ({ _id: id, count }));
        }
        return [];
    }
}

module.exports = {
    Employee: new JsonModel('employees'),
    Expense: new JsonModel('expenses'),
    LeaveRequest: new JsonModel('leaverequests'),
    Customer: new JsonModel('customers'),
    Vendor: new JsonModel('vendors'),
    Site: new JsonModel('sites')
};
