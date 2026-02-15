const knex = require('./db/knex');

async function check() {
    try {
        const hasColumn = await knex.schema.hasColumn('customers', 'country');
        console.log(`Column "country" exists in "customers" table: ${hasColumn}`);

        if (hasColumn) {
            const count = await knex('customers').count('* as count').first();
            console.log(`Total customers in DB: ${count.count}`);
        }
    } catch (e) {
        console.error("Check failed:", e.message);
    } finally {
        process.exit();
    }
}

check();
