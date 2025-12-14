// scripts/smoke_pg_core_v2.js
// Intended to be run with DB_CLIENT=pg and Valid DATABASE_URL

const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function run() {
    console.log('[PG-SMOKE] Starting Smoke Test...');

    // 1. Verify DB Client
    if (knex.client.config.client !== 'pg') {
        console.warn('[PG-SMOKE] WARNING: Not running on PG client. Found: ' + knex.client.config.client);
        // We allow continuing for testing the script logic itself on sqlite if needed
    }

    try {
        // 2. Create Doc
        const docId = uuidv4();
        console.log(`[PG-SMOKE] Creating Doc ${docId}...`);
        await knex('documents').insert({
            id: docId,
            project: 'smoke-pg',
            status: 'extracted',
            docNumber: 'PG-001',
            docTypeLabel: 'Fatura PG',
            total: 500.00,
            date: new Date()
        });

        // 3. Create Transaction
        const txId = uuidv4();
        console.log(`[PG-SMOKE] Creating Transaction ${txId}...`);
        await knex('transactions').insert({
            id: txId,
            project: 'smoke-pg',
            orgId: 'smoke-pg',
            title: 'PG Smoke Transaction',
            status: 'open',
            customer_name: 'PG Customer'
        });

        // 4. Link & Verify FK
        console.log(`[PG-SMOKE] Linking...`);
        await knex('transaction_docs').insert({
            transaction_id: txId,
            doc_id: docId,
            role: 'primary'
        });

        // 5. Verify Query
        const linked = await knex('transaction_docs')
            .join('documents', 'transaction_docs.doc_id', 'documents.id')
            .where({ transaction_id: txId })
            .select('documents.docNumber');

        if (linked[0].docNumber !== 'PG-001') throw new Error('Link verify failed');
        console.log('[PG-SMOKE] SUCCESS. Data flow verified.');

    } catch (e) {
        console.error('[PG-SMOKE] FAIL:', e);
        process.exit(1);
    } finally {
        knex.destroy();
    }
}

run();
