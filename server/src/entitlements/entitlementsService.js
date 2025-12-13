const knex = require('../db/knex');

class EntitlementsService {
    async getEntitlementsForPlan(planKey) {
        // Cache this ideally
        const rows = await knex('entitlements').where({ planKey });
        const map = {};
        for (const r of rows) {
            map[r.key] = { enabled: !!r.enabled, limit: r.limitValue };
        }
        return map;
    }

    // In a real app, trackUsage/checkQuota would query usage_events
    async trackUsage(ctx, key, qty = 1) {
        if (!ctx.org || !ctx.org.id) return; // No org context (e.g. optional mode default)

        await knex('usage_events').insert({
            orgId: ctx.org.id,
            userId: ctx.user ? ctx.user.id : null,
            project: ctx.project || 'unknown',
            key,
            qty,
            ts: new Date().toISOString()
        });
    }

    async checkQuota(ctx, key, qty = 1) {
        // Placeholder: Checks if entitlements allow it
        // If ctx.entitlements is loaded
        if (!ctx.entitlements) return true; // Fail open or closed? Open for now to not break
        const ent = ctx.entitlements[key];
        if (!ent) return false; // Feature not present in plan
        if (!ent.enabled) return false;

        // If limit exists, check usage_events sum (TODO for future)
        // if (ent.limit !== null) { ... }

        return true;
    }
}

module.exports = new EntitlementsService();
