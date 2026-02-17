// server/smoke_catalog_resolve.js
const CatalogService = require('./src/modules/catalog/service');

async function test() {
    console.log('--- Testing Catalog Resolution ---');

    const brands = ['nicolazzi'];
    const testSkus = ['1002-28-CR', '84-05-55-OG', '3458-15-CR'];

    for (const sku of testSkus) {
        console.log(`\nResolving: ${sku}...`);
        const result = await CatalogService.resolveItem('nicolazzi', sku);
        console.log('Result:', JSON.stringify(result, null, 2));
    }

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
