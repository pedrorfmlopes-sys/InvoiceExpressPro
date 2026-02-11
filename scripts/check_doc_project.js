const path = require('path');
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = path.resolve(__dirname, '../data/db.sqlite');
const knex = require('../server/src/db/knex');

async function checkProject() {
    try {
        const rows = await knex('documents')
            .where('customer', 'like', '%NICOLAZZI%')
            .limit(5)
            .select('id', 'docNumber', 'project', 'filePath');

        console.log('--- Nicolazzi Docs Projects ---');
        console.log(rows);
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        knex.destroy();
    }
}

checkProject();
