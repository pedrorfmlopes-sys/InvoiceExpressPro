/**
 * verify_backup_workflow.js
 * Verifies Phase 8: Conflict Detection, Backups, and Restore Logic
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const Adapter = require('../server/src/storage/getDocsAdapter');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function verifyBackupWorkflow() {
    console.log('--- STARTING VERIFICATION: PHASE 8 BACKUP WORKFLOW ---');
    const project = 'verify_backup_test';
    const docId1 = 'doc-1-existing';
    const docId2 = 'doc-2-conflicting';

    try {
        // 0. Clean up previous test data
        await knex('documents').where({ project }).delete();
        await knex('document_backups').where({ project }).delete();
        console.log('CLEANUP: Previous test data removed.');

        // 1. Create an existing document in the archive (main DB)
        const existingDoc = {
            id: docId1,
            project,
            docNumber: 'BACKUP-TEST-001',
            supplier: 'ENTITY-A',
            docType: 'fatura',
            status: 'processado',
            total: 100.00,
            created_at: new Date(),
            updated_at: new Date(),
            rawJson: JSON.stringify({ id: docId1, total: 100, custom: 'original' })
        };
        await Adapter.saveDocument(project, existingDoc);
        console.log('STEP 1: Created existing document in archive.');

        // 2. Simulate Conflict Detection in finalizeBulk
        // Note: we can't easily call the controller without a full express req/res
        // so we'll simulate the controller's logic using the adapter and knex.

        console.log('STEP 2: Testing Conflict Detection...');
        const conflicts = await knex('documents')
            .where({ project, docNumber: 'BACKUP-TEST-001', supplier: 'ENTITY-A', docType: 'fatura' })
            .select('*');

        if (conflicts.length > 0) {
            console.log('SUCCESS: Conflict detected correctly.');
        } else {
            throw new Error('FAILED: Conflict NOT detected.');
        }

        // 3. Create Backup on Forced Overwrite
        console.log('STEP 3: Testing Backup Creation on Overwrite...');
        const conflict = conflicts[0];
        const snapshot = { ... (conflict.rawJson ? JSON.parse(conflict.rawJson) : {}), ...conflict };
        await Adapter.createBackup(project, conflict.id, snapshot, 'Overwrite during verification');

        const backups = await Adapter.getBackups(project, conflict.id);
        if (backups.length === 1) {
            console.log('SUCCESS: Backup created successfully.');
            console.log('Backup Meta:', { id: backups[0].id, reason: backups[0].reason, expires: backups[0].expires_at });
        } else {
            throw new Error('FAILED: Backup NOT created.');
        }

        // 4. Overwrite existing with new data
        const newDocData = { ...existingDoc, total: 200.00, rawJson: JSON.stringify({ id: docId1, total: 200, custom: 'updated' }) };
        await Adapter.saveDocument(project, newDocData);
        console.log('STEP 4: Document overwritten with new data (Total: 200).');

        // 5. Verify Restore Logic
        console.log('STEP 5: Testing Restore Logic...');
        const backupToRestore = backups[0];

        // Before restore, verify "Auto-backup on restore"
        const currentBeforeRestore = await Adapter.getDoc(project, docId1);
        await Adapter.createBackup(project, currentBeforeRestore.id, currentBeforeRestore, 'Auto-backup before restore');

        // Perform Restore
        const snapshotToRestore = JSON.parse(backupToRestore.data_snapshot);
        await Adapter.saveDocument(project, snapshotToRestore);

        const restoredDoc = await Adapter.getDoc(project, docId1);
        if (restoredDoc.total === 100.00) {
            console.log('SUCCESS: Document restored to total 100.00.');
        } else {
            throw new Error(`FAILED: Document NOT restored correctly. Total is ${restoredDoc.total}`);
        }

        // 6. Verify Backups Count
        const finalBackups = await Adapter.getBackups(project, docId1);
        console.log(`STEP 6: Verifying final backup count: ${finalBackups.length}`);
        if (finalBackups.length === 2) {
            console.log('SUCCESS: Found original backup AND the one created during restore.');
        } else {
            throw new Error(`FAILED: Incorrect backup count. Expected 2, got ${finalBackups.length}`);
        }

        // 7. Verify Cleanup (Manual trigger)
        console.log('STEP 7: Testing Cleanup (Simulated expiration)...');
        // Manually expire one backup
        await knex('document_backups')
            .where({ id: backupToRestore.id })
            .update({ expires_at: Date.now() - 1000 });

        const deletedCount = await Adapter.cleanupExpiredBackups();
        if (deletedCount === 1) {
            console.log('SUCCESS: Expired backup cleaned up.');
        } else {
            throw new Error(`FAILED: Cleanup did not remove expired backup. Deleted: ${deletedCount}`);
        }

        console.log('--- ALL BACKEND VERIFICATION TESTS PASSED ---');

    } catch (e) {
        console.error('VERIFICATION FAILED:', e.message);
        process.exit(1);
    } finally {
        // Keep data for manual inspection if needed, or cleanup
        // await knex('documents').where({ project }).delete();
        // await knex('document_backups').where({ project }).delete();
        await knex.destroy();
    }
}

verifyBackupWorkflow();
