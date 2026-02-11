const fs = require('fs');
const path = require('path');
const controller = require('../server/src/modules/extraction_v2/controller');
const sqlite3 = require('sqlite3');

const testFile = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/085.pdf';

async function verifyStep2() {
    console.log('Verifying Step 2: Sandbox-First Persistence...');

    if (!fs.existsSync(testFile)) {
        console.error('Test file not found!');
        return;
    }

    // Prepare mock request
    const tempTestPath = path.join(__dirname, 'temp_test_085.pdf');
    fs.copyFileSync(testFile, tempTestPath);

    const req = {
        project: 'default',
        file: {
            path: tempTestPath,
            originalname: '085.pdf'
        },
        query: { batchId: 'verify-step-2-' + Date.now() }
    };

    let resultData = null;
    const res = {
        status: () => res,
        json: (data) => { resultData = data; }
    };

    console.log('Triggering extraction via controller.extract...');
    await controller.extract(req, res);

    if (!resultData || !resultData.results || resultData.results[0].status !== 'success') {
        console.error('Extraction failed:', resultData);
        return;
    }

    const docId = resultData.results[0].documentId;
    console.log('Document ID created:', docId);

    // 1. Check Main DB (Ledger)
    const mainDb = new sqlite3.Database('data/db.sqlite');
    mainDb.get('SELECT * FROM documents WHERE id = ?', [docId], (err, row) => {
        if (err || !row) {
            console.error('Main DB Check Failed:', err);
        } else {
            const raw = JSON.parse(row.rawJson);
            console.log('\n--- Main DB Entry (Ledger) ---');
            console.log('Doc Number:', row.docNumber);
            console.log('Is Sandbox (in rawJson):', raw.normalized.isSandbox);
            console.log('RawJson Normalized Keys:', Object.keys(raw.normalized));

            if (raw.normalized.isSandbox && !raw.normalized.lines) {
                console.log('SUCCESS: Main DB entry is "light" (Sandbox mode).');
            } else {
                console.warn('WARNING: Main DB entry still contains full data? Check logic.');
            }
        }
        mainDb.close();
    });

    // 2. Check Satellite DB (Sandbox)
    const satDb = new sqlite3.Database('data/extractors/nicolazzi_proformas.sqlite');
    satDb.get('SELECT * FROM extractions WHERE docId = ?', [docId], (err, row) => {
        if (err || !row) {
            console.error('Satellite DB Check Failed (Entry not found):', err);
        } else {
            const data = JSON.parse(row.dataJson);
            console.log('\n--- Satellite DB Entry (Sandbox) ---');
            console.log('Lines found in Satellite:', data.lines.length);
            console.log('Total in Satellite:', data.totals.total);

            if (data.lines.length > 0) {
                console.log('SUCCESS: Detailed data found in Satellite DB.');
            } else {
                console.error('FAILURE: Satellite DB entry is empty.');
            }
        }
        satDb.close();
    });
}

verifyStep2().catch(console.error);
