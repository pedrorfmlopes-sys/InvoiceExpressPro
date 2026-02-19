const knex = require('./server/src/db/knex');

async function findDoc() {
    try {
        const rows = await knex('documents')
            .where('docNumber', 'like', '%001674/B%')
            .select('id', 'docNumber', 'docType', 'project', 'supplier', 'customer');

        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

findDoc();
