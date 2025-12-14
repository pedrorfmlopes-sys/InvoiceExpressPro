// scripts/db_health.js
require('dotenv').config();
const knex = require('../server/src/db/knex');

async function health() {
    try {
        await knex.raw('SELECT 1+1 as result');

        // Count tables
        let tables = [];
        const client = knex.client.config.client;

        if (client === 'sqlite3') {
            const rows = await knex.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            tables = rows.map(r => r.name);
        } else {
            const rows = await knex.raw("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
            tables = rows.rows.map(r => r.table_name);
        }

        console.log(`[HEALTH] OK. Connected to ${client}.`);
        console.log(`[HEALTH] Tables found (${tables.length}): ${tables.join(', ')}`);
        process.exit(0);
    } catch (e) {
        console.error('[HEALTH] FAIL:', e.message);
        process.exit(1);
    }
}
health();
