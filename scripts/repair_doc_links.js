require('dotenv').config();
const knex = require('../server/src/db/knex');

async function repair() {
    try {
        console.log("Forcing repair of doc_links...");
        console.log(`Using DB: ${process.env.SQLITE_FILENAME || 'DEFAULT'}`);

        await knex.schema.dropTableIfExists('doc_links');
        console.log("Dropped doc_links.");

    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}
repair();
