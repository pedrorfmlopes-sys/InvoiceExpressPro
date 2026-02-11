
const path = require('path');
const PROJECT_ROOT = 'c:\\Users\\pedro\\OneDrive\\APPS\\GitHub\\InvoiceStudioGRVTY-main';
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const knex = require(path.join(PROJECT_ROOT, 'server/src/db/knex'));
const { v4: uuidv4 } = require('uuid');
const Adapter = require(path.join(PROJECT_ROOT, 'server/src/storage/DbDocsAdapter'));
const CoreV2Controller = require(path.join(PROJECT_ROOT, 'server/src/modules/coreV2/controller'));

// Mock Express Objects
const mockReq = (body, project = 'Proj_2026') => ({
    body,
    project,
    query: {},
    params: {}
});

const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

const fs = require('fs');

(async () => {
    console.log('\n--- SMOKE TEST: BACKUP CREATION LOGIC ---\n');
    const project = 'Proj_2026';
    const supplierName = 'SMOKE_TEST_SUPPLIER_' + Date.now();
    const docNumber = 'SMOKE-' + Date.now();

    // UUIDs
    const docId1 = uuidv4();
    const docId2 = uuidv4();

    // Create Dummy File in 'data' (safer)
    const dataDir = path.join(PROJECT_ROOT, 'data');
    const dummyPath = path.join(dataDir, `smoke_${docId2}.pdf`);
    fs.writeFileSync(dummyPath, 'DUMMY PDF CONTENT');
    console.log(`[Setup] Created dummy file at ${dummyPath}`);

    try {
        // 1. Create FIRST Document (The "Original")
        console.log(`[1] Creating Original Document (ID: ${docId1})...`);
        await knex('documents').insert({
            id: docId1,
            project,
            docNumber,
            docType: 'proforma',
            supplier: supplierName,
            total: 100.00,
            status: 'finalized',
            rawJson: JSON.stringify({ items: [{ desc: 'Original Item', val: 100 }] }),
            created_at: new Date(),
            updated_at: new Date()
        });
        console.log('    -> Success.');

        // 2. Create SECOND Document (The "New Version" / "Stage")
        console.log(`[2] Creating Staging Document (ID: ${docId2})...`);
        await knex('documents').insert({
            id: docId2,
            project,
            docNumber, // SAME NUMBER -> Conflict
            docType: 'proforma',
            supplier: supplierName, // SAME SUPPLIER -> Conflict
            total: 200.00,
            status: 'extracted',
            filePath: dummyPath, // <--- CRITICAL FIX
            rawJson: JSON.stringify({ items: [{ desc: 'New Item', val: 200 }] }),
            created_at: new Date(),
            updated_at: new Date()
        });
        console.log('    -> Success.');

        // 3. Simulate "Finalize Bulk" with FORCE=TRUE (Triggers Overwrite & Backup)
        console.log(`[3] Executing Controller: finalizeBulk (Force=TRUE)...`);

        const req = mockReq({
            items: [{ id: docId2 }], // Trying to finalize the NEW one
            force: true,             // Force overwrite of the OLD one
            backupReason: 'SMOKE_TEST_BACKUP'
        }, project);

        const res = mockRes();

        await CoreV2Controller.finalizeBulk(req, res);

        // 4. Validate Controller Response
        console.log(`[4] Controller Response:`, JSON.stringify(res.data, null, 2));

        if (!res.data || !res.data.results || !res.data.results[0].ok) {
            throw new Error('Controller failed to finalize document.');
        }

        // 5. Validate Database State
        console.log(`[5] Verifying Database State...`);

        // 5a. Check if Original Doc (docId1) is DELETED (or gone from documents table)
        const oldDoc = await knex('documents').where({ id: docId1 }).first();
        if (!oldDoc) {
            console.log('    -> [OK] Superseded Document (Old ID) was removed from main table.');
        } else {
            console.error('    -> [FAIL] Superseded Document (Old ID) STILL EXISTS in main table!');
        }

        // 5b. Check if New Doc (docId2) is FINALIZED
        const newDoc = await knex('documents').where({ id: docId2 }).first();
        if (newDoc && newDoc.status === 'finalized' && newDoc.docNumber === docNumber) {
            console.log('    -> [OK] New Document is finalized and persisted.');
        } else {
            console.error('    -> [FAIL] New Document state is incorrect:', newDoc);
        }

        // 5c. Check if BACKUP exists for the NEW Doc ID (Migration Logic)
        // The controller migrates backups from Old -> New. 
        // AND it creates a backup of the text of the Old Doc, attached to the New ID.
        const backups = await knex('document_backups').where({ original_doc_id: docId2 }).orderBy('created_at', 'desc');

        if (backups.length > 0) {
            console.log(`    -> [OK] BACKUPS FOUND on New ID (${backups.length})`);
            const latest = backups[0];
            console.log('       - Backup ID:', latest.id);
            console.log('       - Reason:', latest.reason);

            const snapshot = JSON.parse(latest.data_snapshot);
            console.log('       - Snapshot ID (inside JSON):', snapshot.id);

            if (snapshot.id === docId1) {
                console.log('    -> [OK] The backup contains the DATA of the OLD document.');
            } else {
                console.log('    -> [WARN] The backup snapshot ID does not match old doc. (Might be expected if snapshot re-ids?)', snapshot.id);
            }

        } else {
            console.error('    -> [FAIL] NO BACKUPS associated with the New Document ID!');
        }

    } catch (e) {
        console.error('\n[!!!] SMOKE TEST FAILED:', e);
    } finally {
        // Cleanup
        console.log('\n[6] Cleaning up test data...');
        await knex('documents').where({ id: docId1 }).orWhere({ id: docId2 }).delete();
        await knex('document_backups').where({ original_doc_id: docId1 }).delete();
        await knex('document_backups').where({ original_doc_id: docId2 }).delete(); // Just in case
        process.exit(0);
    }
})();
