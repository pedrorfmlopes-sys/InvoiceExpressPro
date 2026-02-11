const axios = require('axios');
const db = require('../server/src/db/knex');
const Adapter = require('../server/src/storage/DbDocsAdapter');

const project = 'STRESS_CONCURRENCY_' + Date.now();
const baseUrl = 'http://localhost:3000/api/corev2';

async function run() {
    console.log('--- [Stress] Restoration Concurrency Test ---');

    // 1. Setup
    const docNumber = 'STRESS-CONC-001';
    await Adapter.saveDocument(project, { docNumber, docType: 'fatura', total: 100 });
    const doc = await db('documents').where({ project, docNumber }).first();

    // Trigger backup
    await axios.post(`${baseUrl}/docs/finalize-bulk?project=${project}`, {
        items: [{ id: doc.id, docNumber, total: 200 }],
        force: true
    });

    const backup = await db('document_backups').where({ project, original_doc_id: doc.id }).first();
    const backupId = backup.id;

    // 2. Concurrent Restores
    console.log('[Stress] Launching 10 concurrent restore requests...');
    const requests = [];
    for (let i = 0; i < 10; i++) {
        requests.push(axios.post(`${baseUrl}/backups/${backupId}/restore?project=${project}`));
    }

    const results = await Promise.allSettled(requests);
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    console.log(`[Stress] Results: Success=${successes}, Failure=${failures}`);

    // 3. Verify survivors
    const finalDocs = await db('documents').where({ project, docNumber });
    console.log('[Stress] Final active documents count:', finalDocs.length);

    if (finalDocs.length === 1) {
        console.log('✅ SUCCESS: Exactly 1 document remains active. Concurrency handled.');
    } else {
        console.error('❌ FAILED: Multiple documents created or data lost!');
    }

    // Cleanup
    await db('documents').where({ project }).delete();
    await db('document_backups').where({ project }).delete();
    process.exit(finalDocs.length === 1 ? 0 : 1);
}

run().catch(console.error);
