require('dotenv').config();
const knex = require('../server/src/db/knex');

async function clean() {
    try {
        console.log(`Using DB: ${process.env.SQLITE_FILENAME || 'DEFAULT'}`);
        console.log("Cleaning missing migrations...");
        const names = ['_core_v2_enhance.js', '20250102_fix_doc_links_schema.js'];

        for (const name of names) {
            const res = await knex('knex_migrations').where('name', name).del();
            console.log(`Deleted ${name}: ${res}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}
clean();
