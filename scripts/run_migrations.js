const knex = require('../server/src/db/knex');

async function run() {
    console.log('Running migrations...');
    try {
        await knex.migrate.latest({
            directory: './server/src/db/migrations'
        });
        console.log('Migrations complete');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        knex.destroy();
    }
}

run();
