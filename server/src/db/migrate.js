const knex = require('./knex');

async function migrate() {
    try {
        console.log('[DB] Running migrations...');
        await knex.migrate.latest();
        console.log('[DB] Migrations complete.');
        process.exit(0);
    } catch (e) {
        console.error('[DB] Migration failed:', e);
        process.exit(1);
    }
}

migrate();
