
const path = require('path');
const PROJECT_ROOT = 'c:\\Users\\pedro\\OneDrive\\APPS\\GitHub\\InvoiceStudioGRVTY-main';
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const knex = require(path.join(PROJECT_ROOT, 'server/src/db/knex'));

(async () => {
    try {
        const rows = await knex('document_backups').orderBy('created_at', 'desc').limit(5);
        console.log('--- BACKUPS TABLE DUMP (Limit 5) ---');
        console.log(JSON.stringify(rows, null, 2));

        // Count total backups
        const count = await knex('document_backups').count('* as count').first();
        console.log('\nTotal Backups:', count.count);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
