
const knex = require('./server/src/db/knex');

async function debug() {
    try {
        const counts = await knex('catalog_items').count('id as count').select('brand').groupBy('brand');
        console.log('Catalog Counts:', counts);

        const samples = await knex('catalog_items').limit(5).select('brand', 'sku', 'handle', 'finish_group');
        console.log('Samples:', samples);

        const finishes = await knex('catalog_finishes').limit(5);
        console.log('Finishes:', finishes);

    } catch (e) {
        console.error('Debug failed:', e);
    } finally {
        process.exit();
    }
}

debug();
