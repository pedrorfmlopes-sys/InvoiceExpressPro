const knex = require('../server/src/db/knex');

async function check() {
    try {
        const rows = await knex('knex_migrations').select('*');
        console.log("Migrations:", rows.map(r => r.name));
    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}
check();
