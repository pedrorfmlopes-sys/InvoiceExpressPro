const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Mock Environment
const project = 'default';
const docId = 'test_invoice_' + Date.now();
const mainDbPath = path.resolve(__dirname, 'data/db.sqlite');
const satellitePath = path.resolve(__dirname, 'server/data/extractors/nicolazzi_invoices.sqlite');

console.log('--- STARTING REAL TEST: INVOICE STUDIO CONTAINER LOGIC ---\n');

// 1. Setup Main DB Mock Record
function setupMainDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(mainDbPath, (err) => {
            if (err) reject(err);
        });

        const mockJson = JSON.stringify({
            docNumber: 'TEST-001',
            date: '2025-02-19',
            total: '123.45',
            shippingMarks: 'MARKS-FROM-MAIN-DB',
            entities: { customer: { name: 'Test Client' } }
        });

        db.run(`INSERT INTO documents (id, project, docType, docNumber, rawJson, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [docId, project, 'invoice', 'TEST-001', mockJson, 'staging', new Date().toISOString(), new Date().toISOString()],
            function (err) {
                if (err) reject(err);
                else {
                    console.log(`[Main DB] Created test document: ${docId}`);
                    resolve();
                }
                db.close();
            });
    });
}

// 2. Simulate Satellite Save (what the Container does via API)
// We'll use the SatelliteStorage class directly to mimic the API controller
async function testSatelliteSave() {
    console.log('\n[Container Simulation] Saving updated data...');

    // Import the actual storage class
    const SatelliteStorage = require('./server/src/storage/SatelliteStorage');

    const newData = {
        docNumber: 'TEST-001-UPDATED', // Changed
        date: '2025-02-19',
        total: '123.45',
        shippingMarks: 'MARKS-EDITED-BY-USER', // Crucial Test
        entities: { customer: { name: 'Test Client' } },
        lines: [{ description: 'Test Item', total: '100.00' }],
        totals: { net: '100.00', vat: '23.45', gross: '123.45' }
    };

    try {
        await SatelliteStorage.saveData('nicolazzi_invoices', docId, newData);
        console.log('[Satellite] Save successful.');
    } catch (e) {
        console.error('[Satellite] Save FAILED:', e.message);
        throw e;
    }
}

// 3. Verify Persistence (Read back from Satellite)
async function verifyPersistence() {
    console.log('\n[Verification] Reading back from Satellite...');
    const SatelliteStorage = require('./server/src/storage/SatelliteStorage');

    const savedData = await SatelliteStorage.getData('nicolazzi_invoices', docId);

    if (!savedData) {
        console.error('❌ FAILED: No data found in Satellite.');
        return;
    }

    console.log('--- READ RESULT ---');
    console.log('Doc Number:', savedData.docNumber);
    console.log('Shipping Marks:', savedData.shippingMarks);

    if (savedData.shippingMarks === 'MARKS-EDITED-BY-USER') {
        console.log('✅ SUCCESS: Shipping Marks persisted correctly.');
    } else {
        console.error('❌ FAILED: Shipping Marks mismatch.');
    }
}

// Run Test Sequence
(async () => {
    try {
        await setupMainDb();
        await testSatelliteSave();
        await verifyPersistence();
        console.log('\n--- TEST COMPLETE ---');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ CRITICAL ERROR:', e);
        process.exit(1);
    }
})();
