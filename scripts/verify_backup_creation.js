
const path = require('path');
const PROJECT_ROOT = 'c:\\Users\\pedro\\OneDrive\\APPS\\GitHub\\InvoiceStudioGRVTY-main';
const knex = require(path.join(PROJECT_ROOT, 'server/src/db/knex'));
const { v4: uuidv4 } = require('uuid');
const Adapter = require(path.join(PROJECT_ROOT, 'server/src/storage/DbDocsAdapter'));

(async () => {
    console.log('[Verify Backup] Starting verification...');
    const project = 'Proj_2026';
    const docId = uuidv4();
    const docNumber = 'TEST-BACKUP-' + Date.now();

    try {
        // 1. Create Initial Document (Simulating a finalized doc)
        console.log('[Verify Backup] Creating initial document...');
        await knex('documents').insert({
            id: docId,
            project,
            docNumber,
            docType: 'proforma',
            supplier: 'TEST_SUPPLIER',
            total: 100.00,
            status: 'processado',
            rawJson: JSON.stringify({ items: [{ desc: 'Item 1', val: 100 }] }),
            created_at: Date.now(),
            updated_at: Date.now()
        });

        // 2. Simulate Overwrite (Finalize a new doc with same number)
        // This should trigger the backup logic in finalizeDoc or finalizeBulk
        // We'll use Adapter.createBackup directly first to verify the mechanism, 
        // then we can try the service flow if needed. 
        // But the user asked "when I send save copy" which usually implies the conflict flow.

        console.log('[Verify Backup] Simulating overwrite (Manual Backup Call)...');
        const originalDoc = await Adapter.getDoc(project, docId);
        if (!originalDoc) throw new Error('Initial doc not found');

        const backupId = await Adapter.createBackup(project, docId, originalDoc, 'Verification Script Backup');
        console.log(`[Verify Backup] Backup created with ID: ${backupId}`);

        // 3. Verify Backup Exists in DB
        const backup = await knex('document_backups').where({ id: backupId }).first();

        if (backup) {
            console.log('SUCCESS: Backup found in database.');
            console.log(' - ID:', backup.id);
            console.log(' - Original Doc ID:', backup.original_doc_id);
            console.log(' - Project:', backup.project); // Crucial check
            console.log(' - Reason:', backup.reason);
            console.log(' - Snapshot Size:', backup.data_snapshot.length, 'bytes');

            if (backup.project !== project) {
                console.error('FAILURE: Project mismatch in backup!');
            }
        } else {
            console.error('FAILURE: Backup not found in database.');
        }

    } catch (e) {
        console.error('[Verify Backup] Error:', e);
    } finally {
        // Cleanup
        console.log('[Verify Backup] Cleaning up test data...');
        await knex('document_backups').where({ original_doc_id: docId }).delete();
        await knex('documents').where({ id: docId }).delete();
        process.exit(0);
    }
})();
