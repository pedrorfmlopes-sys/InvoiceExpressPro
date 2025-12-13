const jwt = require('jsonwebtoken');
const UserService = require('../services/UserService');
const EntitlementsService = require('../entitlements/entitlementsService');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
const AUTH_MODE = process.env.AUTH_MODE || 'optional';

async function attachContext(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const ctx = await UserService.getUserContext(decoded.userId);
            if (ctx) {
                // Load entitlements
                const entitlements = await EntitlementsService.getEntitlementsForPlan(ctx.planKey);
                req.ctx = {
                    ...ctx,
                    entitlements,
                    isAuthenticated: true
                };
            }
        } catch (e) {
            console.warn('[Auth] Invalid token:', e.message);
            // Expired or bad token -> treat as guest unless required mode handles it
        }
    }

    // If no valid context yet, apply defaults based on Auth Mode
    if (!req.ctx) {
        if (AUTH_MODE === 'required') {
            req.ctx = { isAuthenticated: false }; // Middleware requireAuth will block
        } else {
            // Optional mode: Default Admin Access
            req.ctx = {
                user: { id: 'default-admin', name: 'Local Admin' },
                org: { id: 'default-org', name: 'Local Org' },
                role: 'admin',
                planKey: 'pro', // Give pro features locally
                entitlements: { 'all': { enabled: true } }, // Super permissive
                isAuthenticated: true // effectively
            };
        }
    }

    // Helper to merge query project if exists
    if (req.query.project) {
        req.ctx.project = req.query.project;
    }

    next();
}

function requireAuth(req, res, next) {
    if (AUTH_MODE === 'optional') return next();

    // Whitelist public endpoints (if matched here)
    if (req.path === '/health' || req.originalUrl.includes('/health')) return next();

    if (req.ctx && req.ctx.isAuthenticated) return next();
    return res.status(401).json({ error: 'Authentication required' });
}

function requireRole(role) {
    return (req, res, next) => {
        if (req.ctx && req.ctx.role === role) return next();
        // Loose check for optional default admin
        if (AUTH_MODE === 'optional') return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

module.exports = {
    attachContext,
    requireAuth,
    requireRole,
    JWT_SECRET
};
