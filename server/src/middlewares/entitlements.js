const { requireAuth, AUTH_MODE } = require('./auth');
const EntitlementsService = require('../entitlements/entitlementsService');

function requireEntitlement(key) {
    return async (req, res, next) => {
        // First ensure context is attached (this usually requires auth, but in optional mode ctx exists as default)
        if (!req.ctx) {
            return res.status(500).json({ error: 'Context not initialized' });
        }

        const entitlement = req.ctx.entitlements ? req.ctx.entitlements[key] : null;

        // Logic:
        // 1. Check if allowed
        const allowed = entitlement && entitlement.enabled; // Simple boolean check enabled/disabled

        // 2. Track usage (always track if we strive for visibility, or only if allowed?)
        // Let's track attempted usage?
        // Service.trackUsage(ctx, key, qty)

        // 3. Enforce based on AUTH_MODE
        const shouldEnforce = process.env.AUTH_MODE === 'required';

        if (!allowed) {
            if (shouldEnforce) {
                // Block
                return res.status(403).json({ error: `Feature not enabled: ${key}` });
            } else {
                // Log and Allow (Optional mode)
                console.log(`[Entitlements] WOULD BLOCK: ${key} (User: ${req.ctx.user.id})`);
            }
        }

        // If allowed (or ignored blocking), track usage
        // Note: tracking might be redundant if blocked, but tracking *successful* usage is key.
        if (allowed || !shouldEnforce) {
            try {
                // We assume QTY=1 for simple middleware endpoint access
                await EntitlementsService.trackUsage(req.ctx, key, 1);
            } catch (e) {
                console.warn('[Entitlements] Failed to track usage:', e.message);
            }
        }

        next();
    };
}

module.exports = {
    requireEntitlement
};
