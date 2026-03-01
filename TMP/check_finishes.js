const knex = require('knex')({
    client: 'sqlite3',
    connection: { filename: 'c:/Users/pedro/OneDrive/APPS/GitHub/InvoiceStudioGRVTY-main/data/db.sqlite' },
    useNullAsDefault: true
});

async function checkFinishes() {
    try {
        const finishes = await knex('catalog_finishes')
            .where({ brand: 'ritmonio' })
            .limit(10);
        console.log(JSON.stringify(finishes, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await knex.destroy();
    }
}

checkFinishes();
