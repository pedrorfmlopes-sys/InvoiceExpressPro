const jwt = require('jsonwebtoken');
const UserService = require('../services/UserService');
const { JWT_SECRET } = require('../middlewares/auth');
const knex = require('../db/knex');

exports.bootstrap = async (req, res) => {
    try {
        // Check if DB has users
        const count = await knex('users').count('id as c').first();
        if (count.c > 0) {
            return res.status(409).json({ error: 'System already initialized' });
        }

        const { email, password, name, orgName } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await UserService.createAdmin(email, password, name, orgName);

        // Generate Token
        const token = jwt.sign({ userId: result.userId, orgId: result.orgId }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: { id: result.userId, email: result.email },
            org: { id: result.orgId },
            message: 'Bootstrap successful'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserService.findByEmail(email);

        if (!user || !(await UserService.validatePassword(user, password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const ctx = await UserService.getUserContext(user.id);
        if (!ctx) return res.status(403).json({ error: 'No active membership' });

        const token = jwt.sign({ userId: ctx.user.id, orgId: ctx.org.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: ctx.user,
            org: ctx.org,
            planKey: ctx.planKey
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.me = (req, res) => {
    res.json(req.ctx);
};
