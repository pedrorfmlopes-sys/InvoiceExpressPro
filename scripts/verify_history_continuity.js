
const path = require('path');
const PROJECT_ROOT = 'c:\\Users\\pedro\\OneDrive\\APPS\\GitHub\\InvoiceStudioGRVTY-main';
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const knex = require(path.join(PROJECT_ROOT, 'server/src/db/knex'));
const { v4: uuidv4 } = require('uuid');
const Adapter = require(path.join(PROJECT_ROOT, 'server/src/storage/DbDocsAdapter'));
const CoreV2Controller = require(path.join(PROJECT_ROOT, 'server/src/modules/coreV2/controller'));
const fs = require('fs');

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

(async () => {
    console.log('\n--- VERIFICATION: HISTORY CONTINUITY ON OVERWRITE ---\n');
    const project = 'Proj_2026';
    const supplierName = 'HISTORY_TEST_SUPPLIER_' + Date.now();
    const docNumber = 'HIST-' + Date.now();

    // UUIDs
    const docIdA = uuidv4(); // The Old Document
    const docIdB = uuidv4(); // The New Document (Overwrite)
    const backupIdOriginal = uuidv4(); // A backup created BEFORE overwrite

    // Dummy File Path
    const dataDir = path.join(PROJECT_ROOT, 'data');
    const dummyPath = path.join(dataDir, `history_${docIdB}.pdf`);
    fs.writeFileSync(dummyPath, 'DUMMY PDF CONTENT');
    console.log(`[Setup] Created dummy file at ${dummyPath}`);

    try {
        // 1. Create Document A (The "Old" one)
        console.log(`[1] Creating Old Document A (ID: ${docIdA})...`);
        await knex('documents').insert({
            id: docIdA,
            project,
            docNumber,
            docType: 'proforma',
            supplier: supplierName,
            total: 100.00,
            status: 'finalized',
            rawJson: JSON.stringify({ items: [{ desc: 'Old Item', val: 100 }] }),
            created_at: Date.now() - 10000, // Created 10s ago
            updated_at: Date.now() - 10000
        });

        // 2. Create a specific backup linked to Document A
        console.log(`[2] Creating Manual Backup linked to A (ID: ${backupIdOriginal})...`);
        await knex('document_backups').insert({
            id: backupIdOriginal,
            project,
            original_doc_id: docIdA, // LINKED TO A
            reason: 'Manual Backup BEFORE Overwrite',
            data_snapshot: JSON.stringify({ note: 'This backup should move to B' }),
            created_at: Date.now() - 5000
        });

        // 3. Create Document B (The "New" one - Staging)
        console.log(`[3] Creating New Document B (ID: ${docIdB})...`);
        await knex('documents').insert({
            id: docIdB,
            project,
            docNumber, // Conflict!
            docType: 'proforma',
            supplier: supplierName, // Conflict!
            total: 200.00,
            status: 'extracted',
            filePath: dummyPath,
            rawJson: JSON.stringify({ items: [{ desc: 'New Item', val: 200 }] }),
            created_at: Date.now(),
            updated_at: Date.now()
        });

        // 4. Execute Overwrite (finalizeBulk force=true)
        console.log(`[4] Executing Controller: finalizeBulk (Force=TRUE)...`);
        const req = mockReq({
            items: [{ id: docIdB }],
            force: true,
            backupReason: 'Overwrite Transition'
        }, project);
        const res = mockRes();

        await CoreV2Controller.finalizeBulk(req, res);

        // 5. Verification
        console.log(`[5] Verifying Result...`);

        // 5a. Doc A should be gone
        const oldDoc = await knex('documents').where({ id: docIdA }).first();
        if (!oldDoc) console.log('    -> [OK] Document A deleted.');
        else console.error('    -> [FAIL] Document A still exists!');

        // 5b. Doc B should be finalized
        const newDoc = await knex('documents').where({ id: docIdB }).first();
        if (newDoc && newDoc.status === 'finalized') console.log('    -> [OK] Document B finalized.');
        else console.error('    -> [FAIL] Document B not finalized correctly.');

        // 5c. THE CRITICAL CHECK: Backup Adoption
        // The backup we created in stap 2 (backupIdOriginal) was linked to A.
        // It SHOULD now be linked to B.
        const migratedBackup = await knex('document_backups').where({ id: backupIdOriginal }).first();

        if (migratedBackup) {
            console.log(`    -> [CHECK] Backup ${backupIdOriginal} found.`);
            console.log(`       - Original Doc ID was: ${docIdA}`);
            console.log(`       - Current Doc ID is:   ${migratedBackup.original_doc_id}`);

            if (migratedBackup.original_doc_id === docIdB) {
                console.log('    -> [SUCCESS] Backup was successfully migrated to Document B!');
            } else {
                console.error('    -> [FAIL] Backup is NOT linked to Document B!');
            }
        } else {
            console.error('    -> [FAIL] Original backup not found!');
        }

        // 5d. Check if the "Overwrite" backup also exists and is linked to B
        // (The logic creates a backup of A just before delete, then migrates it too? 
        //  Wait, the code order was: 
        //  1. Create Backup of A (linked to A)
        //  2. Migrate ALL backups of A to B (including the one just created)
        //  3. Delete A
        //  So there should be at least 2 backups linked to B now.)

        const allBackupsB = await knex('document_backups').where({ original_doc_id: docIdB }).orderBy('created_at', 'desc');
        console.log(`    -> [INFO] Total backups linked to Document B: ${allBackupsB.length}`);
        allBackupsB.forEach(b => console.log(`       - ${b.id} (${b.reason})`));

        if (allBackupsB.length >= 2) {
            console.log('    -> [SUCCESS] Multiple backups found for B (History Preserved).');
        } else {
            console.warn('    -> [WARN] Less than 2 backups found. Check migration logic.');
        }

    } catch (e) {
        console.error('\n[!!!] VERIFICATION FAILED:', e);
    } finally {
        // Cleanup
        console.log('\n[6] Cleanup...');
        await knex('documents').where({ id: docIdA }).orWhere({ id: docIdB }).delete();
        await knex('document_backups').where({ original_doc_id: docIdA }).orWhere({ original_doc_id: docIdB }).delete();
        try { fs.unlinkSync(dummyPath); } catch { }
        process.exit(0);
    }
})();
