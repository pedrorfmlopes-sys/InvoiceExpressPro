// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';

const axios = require('axios');
const app = require('../server/src/app');
const http = require('http');
const knex = require('../server/src/db/knex');

const PORT = 3006;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
    console.log(`\n# Regression Verification V2.3 (Port ${PORT})`);

    // Create Dummy File for extract to work/exist check
    const fs = require('fs');
    const path = require('path');
    const dummyPath = path.resolve('data/staging/reg_test.pdf');
    if (!fs.existsSync(path.dirname(dummyPath))) fs.mkdirSync(path.dirname(dummyPath), { recursive: true });
    fs.writeFileSync(dummyPath, 'dummy content');

    const server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));

    try {
        // 1. Create Doc
        const id = 'reg-test-' + Date.now();
        await knex('documents').insert({
            id,
            project: 'default',
            status: 'extracted',
            docNumber: 'REG-123',
            docType: null, // Simulate Regression: Missing Legacy
            docTypeLabel: 'Fatura Teste', // Canonical Present
            docTypeId: 'fatura-teste',
            filePath: dummyPath,
            total: 100
        });

        // 2. Test Get Suggestions with Debug
        console.log('1. Testing Suggestions Debug...');
        const resSugg = await axios.get(`${BASE_URL}/api/v2/docs/${id}/link-suggestions?project=default&debug=1`);
        const debugMap = resSugg.data.debugMap;
        if (!debugMap) throw new Error('Debug map missing');
        console.log('   Debug OK:', debugMap.reason);

        // 3. Test Patch DocType (Simulating UI Edit)
        console.log('2. Testing Patch DocType (UI Edit)...');
        await axios.patch(`${BASE_URL}/api/v2/docs/${id}?project=default`, {
            docTypeId: 'recibo',
            docTypeLabel: 'Recibo',
            docType: 'Recibo'
        });

        const row = await knex('documents').where({ id }).first();
        if (row.docType !== 'Recibo') throw new Error('Patch failed to update docType');
        console.log('   Patch OK: docType updated to Recibo');

        console.log('DONE.');
    } catch (e) {
        console.error('FAIL:', e.message);
        if (e.response) console.error(e.response.data);
    } finally {
        server.close();
        knex.destroy();
    }
}
run();
