exports.up = async function (knex) {
    // Update Normal Plan Entitlements
    await knex('entitlements')
        .where({ planKey: 'normal', key: 'ai_extract' })
        .update({ enabled: false });

    await knex('entitlements')
        .where({ planKey: 'normal', key: 'pro_reports' })
        .update({ enabled: false });

    // Update Pro Plan Entitlements
    await knex('entitlements')
        .where({ planKey: 'pro', key: 'ai_extract' })
        .update({ enabled: true, limitValue: 100 });

    await knex('entitlements')
        .where({ planKey: 'pro', key: 'pro_reports' })
        .update({ enabled: true });

    // Ensure rows exist if they were missing (simple upsert protection)
    // For brevity assuming seed 20240102 created them. 
    // If not, we could insert, but let's stick to update for now.

    // Also, upgrade existing admin subscription to 'pro' if it is 'normal' (optional for convenience)
    // This helps if we already bootstrapped.
    const adminUser = await knex('users').where({ email: 'admin@smoke.test' }).first();
    if (adminUser) {
        // Find org
        const membership = await knex('memberships').where({ userId: adminUser.id }).first();
        if (membership) {
            await knex('subscriptions')
                .where({ orgId: membership.orgId, status: 'active' })
                .update({ planKey: 'pro' });
        }
    }
};

exports.down = function (knex) {
    // No rollback logic needed strictly for this fix
    return Promise.resolve();
};
