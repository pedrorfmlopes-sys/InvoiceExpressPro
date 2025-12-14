const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000/api/v2';
const PROJECT = 'default';
const TOKEN = 'mock_token_for_auth_mode_required'; // If needed, or use AUTH_MODE=none

async function run() {
    console.log('--- SMOKE TEST V2.4 (Auth Aware) ---');
    console.log(`[Test Config] DB_CLIENT: ${process.env.DB_CLIENT || 'sqlite (default)'}`);
    console.log(`[Test Config] AUTH_MODE: ${process.env.AUTH_MODE || 'optional'}`);
    if (process.env.DB_CLIENT === 'pg' && !process.env.DATABASE_URL) {
        console.error('ERROR: DB_CLIENT=pg requires DATABASE_URL to be set.');
        process.exit(1);
    }
    const email = 'admin@smoke.test';
    const password = 'password123';

    try {
        // 0. Auth (Bootstrap + Login)
        console.log('0. Authenticating...');
        try {
            await axios.post(`${API_URL.replace('/v2', '/auth')}/bootstrap`, { email, password });
        } catch (e) { /* ignore if already bootstrapped */ }

        try {
            const res = await axios.post(`${API_URL.replace('/v2', '/auth')}/login`, { email, password });
            const token = res.data.token;
            headers = { Authorization: `Bearer ${token}` };
            console.log('   - Login successful');
        } catch (e) {
            console.log('   - Login failed (maybe AUTH_MODE=none?), proceeding without token');
        }

        // 1. Create DocTypes (CRUD)
        console.log('1. Testing DocTypes CRUD...');
        const typeId = 'test_type_' + Date.now();
        await axios.post(`${API_URL}/doctypes?project=${PROJECT}`, {
            id: typeId,
            labelPt: 'Tipo Teste',
            synonyms: ['TestType'],
            keywords: ['test']
        }, { headers });
        console.log('   - Created DocType');

        const types = await axios.get(`${API_URL}/doctypes?project=${PROJECT}`, { headers });
        if (!types.data.types.find(t => t.id === typeId)) throw new Error('DocType not found after create');
        console.log('   - Listed DocTypes');

        // 2. Upload & Extract Doc
        console.log('2. Uploading & Extracting...');
        // Insert dummy doc via DB directly to avoid file upload complexity in smoke script
        const knex = require('../server/src/db/knex');
        const docId = 'smoke_test_doc_' + Date.now();
        await knex('documents').insert({
            id: docId,
            project: PROJECT,
            status: 'extracted',
            docNumber: 'DOC-001',
            total: 100.00,
            rawJson: JSON.stringify({ origName: 'test.pdf' })
        });
        console.log('   - Inserted Dummy Doc:', docId);

        // 3. Bulk Patch (Set DocType)
        console.log('3. Testing Bulk Patch...');
        await axios.post(`${API_URL}/docs/bulk?project=${PROJECT}`, {
            ids: [docId],
            patch: {
                docTypeId: typeId,
                docTypeLabel: 'Tipo Teste'
            }
        }, { headers });

        const checkDoc = await knex('documents').where({ id: docId }).first();
        if (checkDoc.docTypeId !== typeId) throw new Error('Bulk patch failed');
        console.log('   - Bulk Patch Verified');

        // 4. Create Transaction
        console.log('4. Creating Transaction...');
        const txTitle = 'Smoke V2.4 Transaction';
        const resTx = await axios.post(`${API_URL}/transactions?project=${PROJECT}`, {
            title: txTitle
        }, { headers });
        const txId = resTx.data.transaction.id;
        console.log('   - Transaction Created:', txId);

        // 5. Link Docs
        console.log('5. Linking Docs...');
        await axios.post(`${API_URL}/transactions/${txId}/add-docs?project=${PROJECT}`, {
            docIds: [docId]
        }, { headers });
        const links = await knex('transaction_docs').where({ transaction_id: txId });
        if (links.length !== 1) throw new Error('Link failed');
        console.log('   - Linked successfully');

        // 6. Export XLSX
        console.log('6. Exporting XLSX...');
        const resExp = await axios.post(`${API_URL}/export.xlsx?project=${PROJECT}&includeRaw=1`, {}, {
            responseType: 'arraybuffer',
            headers
        });
        if (resExp.data.byteLength < 100) throw new Error('Export too small');
        console.log('   - Export downloaded bytes:', resExp.data.byteLength);

        console.log('--- OK: ALL V2.4 TESTS PASSED ---');

    } catch (e) {
        console.error('FAIL:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Response:', e.response.data);
        }
        process.exit(1);
    } finally {
        // Cleanup if needed
        process.exit(0);
    }
}

run();
