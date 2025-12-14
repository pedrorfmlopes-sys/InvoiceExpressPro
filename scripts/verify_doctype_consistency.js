// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional'; // Speed up

const axios = require('axios');
const app = require('../server/src/app');
const http = require('http');
const knex = require('../server/src/db/knex');

const PORT = 3004; // Different port
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
    const server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));
    const fs = require('fs');
    const path = require('path');
    console.log(`\n# Consistency Verification (Port ${PORT})`);

    try {
        // Setup Dummy File
        const dummyPath = path.resolve('data/staging/dummy_v2.pdf');
        if (!fs.existsSync(path.dirname(dummyPath))) fs.mkdirSync(path.dirname(dummyPath), { recursive: true });
        fs.writeFileSync(dummyPath, 'dummy content');

        // 1. Setup Test Doc (Inconsistent State)
        const id = 'v2-consist-' + Date.now();
        await knex('documents').insert({
            id,
            project: 'default',
            status: 'extracted',
            docNumber: 'TEST-123',
            docTypeLabel: 'Fatura', // Canonical
            docTypeId: 'fatura',
            docType: null, // Legacy Missing!
            total: 100,
            filePath: dummyPath
            // origName is in rawJson usually, skipping for verifying docType logic
        });
        console.log('1. Created Inconsistent Doc (docType=null, docTypeLabel=Fatura)');

        // 2. Test PATCH Consistency
        // Update label only regarding some other field or just same logic
        // Actually user wants PATCH to fix it if payload has label.
        // Let's try sending a patch with label
        await axios.patch(`${BASE_URL}/api/v2/docs/${id}?project=default`, {
            docTypeLabel: 'Fatura-Recibo', // Changing type via canonical
            needsReviewDocType: 0 // checking normalization
        });

        let row = await knex('documents').where({ id }).first();
        if (row.docType !== 'Fatura-Recibo') throw new Error(`PATCH Consistency Failed: docType=${row.docType} (expected Fatura-Recibo)`);
        console.log('2. PATCH Consistency: OK');

        // 3. Test READ Consistency (Validate Backfill/Logic)
        // Reset to null for Finalize test
        await knex('documents').where({ id }).update({ docType: null, docTypeLabel: 'Guia', docTypeId: 'guia' });

        // 4. Test Finalize Consistency
        // Should succeed and persist docType=Guia
        await axios.post(`${BASE_URL}/api/v2/docs/finalize?project=default`, {
            id,
            docTypeLabel: 'Guia', // Payload usually includes current state
            docNumber: 'TEST-FINAL'
        });

        row = await knex('documents').where({ id }).first();
        if (row.docType !== 'Guia') throw new Error(`Finalize Consistency Failed: docType=${row.docType} (expected Guia)`);
        console.log('3. Finalize Consistency: OK');

    } catch (e) {
        console.error('ERROR:', e.message);
        if (e.response) console.error('Response:', e.response.data);
    } finally {
        server.close();
        knex.destroy();
    }
}

run();
