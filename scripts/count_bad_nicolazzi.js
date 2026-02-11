const path = require('path');
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = path.resolve(__dirname, '../data/db.sqlite');
const knex = require('../server/src/db/knex');

async function countBadDocs() {
    try {
        const badDocs = await knex('documents')
            .where('customer', 'like', '%NICOLAZZI%')
            .orWhere('customer', 'like', '%S.P.A.%') // Check typical variations
            .select('id', 'docNumber', 'customer', 'filePath');

        console.log(`Found ${badDocs.length} affected documents.`);
        if (badDocs.length > 0) {
            console.log('Sample:', badDocs.slice(0, 3));
        }

    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}

countBadDocs();
