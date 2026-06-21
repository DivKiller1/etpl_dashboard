const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'etpl_dashboard_secret_2024';
const JWT_EXPIRES = '8h';

// Dedicated Atlas connection to inventory-master (users live here, separate from .env MONGODB_URI)
const ATLAS_USERS_URI = process.env.ATLAS_USERS_URI;

let inventoryConn = null;
async function getInventoryConn() {
    if (inventoryConn && inventoryConn.readyState === 1) return inventoryConn;
    inventoryConn = mongoose.createConnection(ATLAS_USERS_URI);
    await inventoryConn.asPromise(); // wait until actually connected
    return inventoryConn;
}

async function getUserModel() {
    const conn = await getInventoryConn();
    if (conn.models && conn.models.User) return conn.models.User;
    const schema = new mongoose.Schema({
        username: String,
        password: String,
        role:     String
    }, { strict: false });
    return conn.model('User', schema, 'users');
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ success: false, message: 'Username and password are required.' });

        const User = await getUserModel();
        const user = await User.findOne({ username: username.trim() }).lean();

        if (!user)
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });

        // Support both bcrypt-hashed and plaintext passwords
        let passwordMatch = false;
        if (user.password && user.password.startsWith('$2')) {
            passwordMatch = await bcrypt.compare(password, user.password);
        } else {
            passwordMatch = (password === user.password);
        }

        if (!passwordMatch)
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });

        const role = (user.role || '').toLowerCase();
        if (!['admin', 'hr'].includes(role))
            return res.status(403).json({ success: false, message: 'Account role not recognised. Contact your administrator.' });

        const token = jwt.sign(
            { userId: user._id, username: user.username, role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        res.json({
            success: true,
            token,
            user: { username: user.username, role }
        });
    } catch (err) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// GET /api/v1/auth/verify  — lightweight token check
router.get('/verify', (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ success: false, message: 'No token provided.' });

        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ success: true, user: { username: decoded.username, role: decoded.role } });
    } catch {
        res.status(401).json({ success: false, message: 'Token invalid or expired.' });
    }
});

module.exports = router;
