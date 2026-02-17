
const knex = require('../server/src/db/knex');

async function check() {
    try {
        const exists = await knex.schema.hasTable('catalog_collections');
        console.log('Table catalog_collections exists:', exists);
        if (!exists) {
            console.log('Attempting migration...');
            await knex.migrate.latest({
                directory: './server/src/db/migrations'
            });
            console.log('Migration done.');
        }
    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        knex.destroy();
    }
}

check();
