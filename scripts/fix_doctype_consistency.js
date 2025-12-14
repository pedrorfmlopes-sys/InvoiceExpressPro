const knex = require('../server/src/db/knex');

async function run() {
    console.log('Running DocType Backfill...');
    try {
        // SQL: UPDATE documents SET docType = COALESCE(docType, docTypeLabel, docTypeId) WHERE docType IS NULL AND (docTypeLabel IS NOT NULL OR docTypeId IS NOT NULL);
        // Knex equivalent
        const rows = await knex('documents')
            .whereNull('docType')
            .andWhere(function () {
                this.whereNotNull('docTypeLabel').orWhereNotNull('docTypeId');
            })
            .select('id', 'docTypeLabel', 'docTypeId');

        console.log(`Found ${rows.length} rows to fix.`);

        for (const r of rows) {
            const effective = r.docTypeLabel || r.docTypeId;
            if (effective) {
                await knex('documents').where({ id: r.id }).update({ docType: effective });
                console.log(`Updated ${r.id}: docType=${effective}`);
            }
        }

        console.log('Backfill complete.');
    } catch (e) {
        console.error('Backfill failed:', e);
    } finally {
        knex.destroy();
    }
}

run();
