// scripts/tmp_check_docs_schema.js
const knex = require('../server/src/db/knex');

async function run() {
    try {
        const client = knex.client.config.client;
        if (client === 'sqlite3' || client === 'sqlite') {
            const info = await knex.raw("PRAGMA table_info(documents)");
            console.table(info);
        } else {
            const info = await knex('information_schema.columns').where({ table_name: 'documents' }).select('column_name', 'data_type');
            console.table(info);
        }
    } catch (e) { console.error(e); }
    finally { knex.destroy(); }
}
run();
