// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';

const axios = require('axios');
const app = require('../server/src/app');
const http = require('http');
const knex = require('../server/src/db/knex');

const PORT = 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
    console.log(`\n# Transactions V2.3 Smoke Test (Port ${PORT})`);
    const server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));

    try {
        // 1. Create Transaction
        console.log('1. Creating Transaction...');
        const resTx = await axios.post(`${BASE_URL}/api/v2/transactions?project=default`, { title: 'Smoke Test Case' });
        const txId = resTx.data.transaction.id;
        console.log('   Warning: TX ID:', txId);

        // 2. Create Dummy Docs
        const doc1Id = 'smoke-tx-1-' + Date.now();
        const doc2Id = 'smoke-tx-2-' + Date.now();
        await knex('documents').insert([
            { id: doc1Id, project: 'default', status: 'uploaded', docNumber: 'DOC-1', filePath: 'dummy' },
            { id: doc2Id, project: 'default', status: 'uploaded', docNumber: 'DOC-2', filePath: 'dummy' }
        ]);

        // 3. Link Docs
        console.log('2. Linking Docs...');
        await axios.post(`${BASE_URL}/api/v2/transactions/${txId}/add-docs?project=default`, { docIds: [doc1Id, doc2Id] });

        // 4. Verify Linkage
        console.log('3. Verifying Linkage...');
        const resGet = await axios.get(`${BASE_URL}/api/v2/transactions/${txId}?project=default`);
        const docs = resGet.data.transaction.docs;
        if (docs.length !== 2) throw new Error('Docs not linked correctly');
        console.log('   Success: Linked 2 docs');

        // 5. Test Auto-Link Suggestion (Mock)
        // Just verify endpoint returns 200
        await axios.post(`${BASE_URL}/api/v2/transactions/auto-link?project=default`, { docId: doc1Id });
        console.log('4. Auto-Link Suggestion Endpoint: OK');

        console.log('DONE. All checks passed.');
    } catch (e) {
        console.error('FAIL:', e.message);
        if (e.response) console.error(e.response.data);
    } finally {
        server.close();
        knex.destroy();
    }
}
run();
