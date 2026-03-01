const knex = require('knex')({
    client: 'sqlite3',
    connection: {
        filename: './server/database.sqlite'
    },
    useNullAsDefault: true
});

async function verify() {
    console.log('--- Verifying Database Lead Times ---');

    const collections = await knex('catalog_collections')
        .where('brand', 'ritmonio')
        .select('name', 'lead_time_weeks');

    console.log('\nCollections:');
    console.table(collections);

    const finishes = await knex('catalog_finishes')
        .where('brand', 'ritmonio')
        .whereNotNull('lead_time_weeks')
        .select('finish_code', 'name', 'lead_time_weeks');

    console.log('\nFinishes with Custom Lead Times:');
    if (finishes.length > 0) {
        console.table(finishes);
    } else {
        console.log('No custom lead times found for finishes.');
    }

    await knex.destroy();
}

verify();
