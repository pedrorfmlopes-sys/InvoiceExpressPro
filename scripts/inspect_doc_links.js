require('dotenv').config();
const knex = require('../server/src/db/knex');

async function inspect() {
    try {
        console.log(`Using DB: ${process.env.SQLITE_FILENAME || 'DEFAULT'}`);
        console.log("Inspecting doc_links...");
        const exists = await knex.schema.hasTable('doc_links');
        console.log("Table exists:", exists);

        if (exists) {
            const cols = await knex('doc_links').columnInfo();
            console.log("Columns:", Object.keys(cols));
        }
    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}
inspect();
