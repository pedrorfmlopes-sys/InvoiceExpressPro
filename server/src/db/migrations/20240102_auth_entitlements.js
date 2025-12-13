exports.up = function (knex) {
    return knex.schema
        .createTable('users', function (t) {
            t.string('id').primary(); // uuid
            t.string('email').unique().notNullable();
            t.string('passwordHash').notNullable();
            t.string('name');
            t.timestamps(true, true);
        })
        .createTable('orgs', function (t) {
            t.string('id').primary(); // uuid
            t.string('name').notNullable();
            t.timestamps(true, true);
        })
        .createTable('memberships', function (t) {
            t.increments('id').primary();
            t.string('userId').references('id').inTable('users').onDelete('CASCADE');
            t.string('orgId').references('id').inTable('orgs').onDelete('CASCADE');
            t.string('role').defaultTo('user'); // admin, user
            t.timestamps(true, true);
            t.unique(['userId', 'orgId']);
        })
        .createTable('plans', function (t) {
            t.string('id').primary(); // uuid or just slug if unique? using string id to be safe
            t.string('key').unique().notNullable(); // normal, pro, premium
            t.string('name');
            t.timestamps(true, true);
        })
        .createTable('subscriptions', function (t) {
            t.string('id').primary();
            t.string('orgId').references('id').inTable('orgs').onDelete('CASCADE');
            t.string('planKey').references('key').inTable('plans');
            t.string('status').defaultTo('active'); // active, trial, canceled
            t.timestamp('renewAt');
            t.timestamps(true, true);
        })
        .createTable('entitlements', function (t) {
            t.increments('id').primary();
            t.string('planKey').references('key').inTable('plans');
            t.string('key').notNullable(); // ai_extract, pro_reports
            t.boolean('enabled').defaultTo(true);
            t.integer('limitValue').nullable(); // null = unlimited
            t.timestamps(true, true);
        })
        .createTable('usage_events', function (t) {
            t.increments('id').primary();
            t.string('orgId').index();
            t.string('userId').nullable();
            t.string('project');
            t.string('key');
            t.float('qty').defaultTo(1);
            t.string('ts');
        })
        .then(async () => {
            // Seed Plans
            const plans = [
                { id: 'p_normal', key: 'normal', name: 'Normal Plan' },
                { id: 'p_pro', key: 'pro', name: 'Pro Plan' },
                { id: 'p_premium', key: 'premium', name: 'Premium Plan' }
            ];
            for (const p of plans) {
                const exists = await knex('plans').where({ key: p.key }).first();
                if (!exists) await knex('plans').insert(p);
            }

            // Seed Entitlements for 'normal'
            const normalEntitlements = [
                { key: 'ai_extract', enabled: false },
                { key: 'pro_reports', enabled: false },
                { key: 'basic_access', enabled: true }
            ];
            // For 'pro'
            const proEntitlements = [
                { key: 'ai_extract', enabled: true, limitValue: 100 },
                { key: 'pro_reports', enabled: true },
                { key: 'basic_access', enabled: true }
            ];

            for (const e of normalEntitlements) {
                const exists = await knex('entitlements').where({ planKey: 'normal', key: e.key }).first();
                if (!exists) await knex('entitlements').insert({ planKey: 'normal', ...e });
            }
            for (const e of proEntitlements) {
                const exists = await knex('entitlements').where({ planKey: 'pro', key: e.key }).first();
                if (!exists) await knex('entitlements').insert({ planKey: 'pro', ...e });
            }
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTable('usage_events')
        .dropTable('entitlements')
        .dropTable('subscriptions')
        .dropTable('plans')
        .dropTable('memberships')
        .dropTable('orgs')
        .dropTable('users');
};
