exports.up = async function (knex) {
    // 1. Transactions Tables
    await knex.schema.createTable('transactions', t => {
        t.string('id').primary();
        t.string('orgId').notNullable();
        t.string('project').notNullable();
        t.string('title').notNullable();
        t.text('description'); // nullable
        t.string('counterparty'); // nullable
        t.string('status').defaultTo('open'); // open/closed
        t.timestamps(true, true);

        t.index(['orgId', 'project', 'updated_at']);
    });

    await knex.schema.createTable('transaction_links', t => {
        t.increments('id').primary();
        t.string('orgId').notNullable();
        t.string('project').notNullable();
        t.string('transactionId').references('id').inTable('transactions').onDelete('CASCADE');
        t.string('documentId').notNullable();
        t.string('linkType'); // proposal/invoice/etc
        t.float('confidence'); // 0..1
        t.string('source').notNullable(); // manual/auto
        t.timestamps(true, true);

        t.index(['project', 'transactionId']);
        t.index(['project', 'documentId']);
    });

    await knex.schema.createTable('transaction_events', t => {
        t.increments('id').primary();
        t.string('orgId').notNullable();
        t.string('project').notNullable();
        t.string('transactionId').notNullable(); // No FK to allow retention if transaction deleted? Or cascade? Keeping loose for audit.
        t.string('ts');
        t.string('kind'); // created/linked/unlinked...
        t.text('payloadJson');
    });

    // 2. Entitlements Seeding
    const plans = ['normal', 'pro', 'premium'];
    const newEntitlements = ['transactions', 'auto_linking', 'exports_zip'];

    // Default: Disabled for all, Enabled for Pro/Premium
    for (const plan of plans) {
        const isPro = plan === 'pro' || plan === 'premium';
        for (const key of newEntitlements) {
            await knex('entitlements').insert({
                planKey: plan,
                key,
                enabled: isPro,
                limitValue: null
            });
        }
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('transaction_events');
    await knex.schema.dropTableIfExists('transaction_links');
    await knex.schema.dropTableIfExists('transactions');

    // Remove entitlements
    await knex('entitlements')
        .whereIn('key', ['transactions', 'auto_linking', 'exports_zip'])
        .delete();
};
