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

        // Short-lived Access Token
        const accessToken = jwt.sign({ userId: ctx.user.id, orgId: ctx.org.id, role: ctx.role }, JWT_SECRET, { expiresIn: '15m' });

        // Long-lived Refresh Token (cookie only)
        // In a robust system, store this in DB (hashed) to allow revocation
        const refreshToken = jwt.sign({ userId: ctx.user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });

        // Set Cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            sameSite: 'lax', // or stric
            secure: process.env.NODE_ENV === 'production',
            path: '/api/auth', // limit scope
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            token: accessToken,
            user: ctx.user,
            org: ctx.org,
            planKey: ctx.planKey
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.refresh = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;
        if (!token) return res.status(401).json({ code: 'NO_REFRESH', error: 'No refresh token' });

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ code: 'INVALID_REFRESH', error: 'Invalid refresh token' });
        }

        if (decoded.type !== 'refresh') return res.status(401).json({ code: 'INVALID_REFRESH', error: 'Not a refresh token' });

        // Verify user still exists
        const ctx = await UserService.getUserContext(decoded.userId);
        if (!ctx) return res.status(403).json({ error: 'User no longer active' });

        // Issue new Access Token
        const accessToken = jwt.sign({ userId: ctx.user.id, orgId: ctx.org.id }, JWT_SECRET, { expiresIn: '15m' });

        // Optional: Rolling Refresh (issue new refresh token)
        // For MVP, we keep the same valid refresh token until it expires
        // Or we can simple re-set session
        res.json({ token: accessToken });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ ok: true });
};

exports.me = (req, res) => {
    res.json({
        user: req.ctx.user,
        org: req.ctx.org,
        role: req.ctx.role,
        planKey: req.ctx.planKey,
        entitlements: req.ctx.entitlements
    });
};
