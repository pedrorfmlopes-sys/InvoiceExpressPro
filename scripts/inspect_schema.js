// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';

const knex = require('../server/src/db/knex');

async function check() {
    try {
        const info = await knex.raw("PRAGMA table_info(transactions)");
        console.log('Transactions Table Schema:');
        console.table(info);
    } catch (e) { console.error(e); }
    finally { knex.destroy(); }
}

check();
