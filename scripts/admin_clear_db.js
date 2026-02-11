const path = require('path');
const fs = require('fs');
const knex = require('knex');

// Connect to internal project DB
const dbPath = path.join(__dirname, '../data/db.sqlite');
console.log(`Target Database: ${dbPath}`);

const db = knex({
    client: 'sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true
});

async function clearDatabase() {
    try {
        console.log('Cleaning up...');

        // delete documents
        const docsCount = await db('documents').count('* as count').first();
        await db('documents').del();
        console.log(`- Deleted ${docsCount.count} rows from 'documents'.`);

        // delete audit_logs
        if (await db.schema.hasTable('audit_logs')) {
            const auditCount = await db('audit_logs').count('* as count').first();
            await db('audit_logs').del();
            console.log(`- Deleted ${auditCount.count} rows from 'audit_logs'.`);
        }

        // delete transactions
        if (await db.schema.hasTable('transactions')) {
            const transCount = await db('transactions').count('* as count').first();
            await db('transactions').del();
            console.log(`- Deleted ${transCount.count} rows from 'transactions'.`);
        }

        // delete doc_links
        if (await db.schema.hasTable('doc_links')) {
            await db('doc_links').del();
            console.log(`- Deleted rows from 'doc_links'.`);
        }

        console.log('Database cleared successfully.');
    } catch (e) {
        console.error('Error clearing database:', e);
    } finally {
        await db.destroy();
    }
}

clearDatabase();
