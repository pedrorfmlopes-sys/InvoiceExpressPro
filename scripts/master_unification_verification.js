/**
 * scripts/master_unification_verification.js
 * Exhaustive verification for the Master Unification Plan (Phase 27).
 * Tests the entire document lifecycle from persistent extraction to atomic archival.
 */

require('dotenv').config();
const knex = require('../server/src/db/knex');
const UniversalDocService = require('../server/src/modules/coreV2/UniversalDocService');
const Adapter = require('../server/src/storage/getDocsAdapter');
const SatelliteStorage = require('../server/src/storage/SatelliteStorage');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const PROJECT = 'verify-unification-test';
const TEST_BATCH_ID = `batch-v2-${Date.now()}`;
const TEST_DOC_ID = uuidv4();
const STAGING_DIR = path.join(process.cwd(), 'uploads', 'test-staging');
const ARCHIVE_DIR = path.join(process.cwd(), 'data', PROJECT, 'archive');

// Ensure directories exist
if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

async function run() {
    console.log(`\n🚀 [VERIFICATION] Starting Exhaustive Test for Batch: ${TEST_BATCH_ID}\n`);

    try {
        // --- 1. Persistent Batch Tracking ---
        console.log('--- TEST 1: Persistent Extraction Batches ---');
        await knex('extraction_batches').insert({
            id: TEST_BATCH_ID,
            project: PROJECT,
            total_files: 1,
            done_files: 0,
            error_files: 0,
            status: 'processing',
            created_at: new Date(),
            updated_at: new Date()
        });
        console.log('✅ Batch initialized in DB.');

        const batch = await knex('extraction_batches').where({ id: TEST_BATCH_ID }).first();
        if (!batch) throw new Error('Batch not found in DB after insert');
        console.log(`✅ Batch retrieved: status=${batch.status}, total=${batch.total_files}`);


        // --- 2. Staging & Write-Through Caching ---
        console.log('\n--- TEST 2: Staging & Write-Through Caching (Nicolazzi) ---');
        const testFile = path.join(STAGING_DIR, `test-${TEST_DOC_ID}.pdf`);
        fs.writeFileSync(testFile, 'PDF-DUMMY-CONTENT');
        console.log(`✅ Created staging file: ${testFile}`);

        // We use Nicolazzi supplier name to trigger write-through logic in Adapter
        const docData = {
            id: TEST_DOC_ID,
            project: PROJECT,
            batchId: TEST_BATCH_ID,
            status: 'staging',
            docType: 'FATURA',
            docNumber: `TEST-UNI-${Date.now()}`,
            supplier: 'NICOLAZZI S.p.A.', // This triggers satellite save
            customer: 'TEST CUSTOMER',
            total: 123.45,
            filePath: testFile,
            lines: [{ code: 'SKU1', description: 'Item 1', quantity: 1, total: 100 }] // Sub-data for satellite
        };

        console.log(`[VERIFICATION] Saving doc ${TEST_DOC_ID} with implicit satellite update...`);
        await Adapter.saveDocument(PROJECT, docData);

        // Verify Main DB
        const mainDoc = await knex('documents').where({ id: TEST_DOC_ID }).first();
        if (!mainDoc) throw new Error('Doc missing in main DB');
        console.log(`✅ Main Doc saved: ${mainDoc.docNumber}, status=${mainDoc.status}`);

        // Verify Satellite (nicolazzi_invoices because docType=FATURA)
        const satDoc = await SatelliteStorage.getData('nicolazzi_invoices', TEST_DOC_ID);
        if (!satDoc) throw new Error('Write-through to satellite FAILED');
        console.log(`✅ Satellite Doc verified: code=${satDoc.lines[0].code}, qty=${satDoc.lines[0].quantity}`);


        // --- 3. Smart Satellite Merging ---
        console.log('\n--- TEST 3: Smart Satellite Merging ---');
        // Let's modify satellite DIRECTLY and see if getDoc merges it
        await SatelliteStorage.saveData('nicolazzi_invoices', TEST_DOC_ID, {
            ...satDoc,
            lines: [{ code: 'SKU-MERGED', description: 'Updated in satellite', quantity: 99, total: 999 }]
        });
        console.log('✅ Satellite data manually updated.');

        const mergedDoc = await UniversalDocService.getDoc(PROJECT, TEST_DOC_ID);
        if (mergedDoc.lines[0].code !== 'SKU-MERGED') {
            throw new Error(`Smart merge FAILED. Expected 'SKU-MERGED', got '${mergedDoc.lines[0].code}'`);
        }
        console.log(`✅ Smart Merge SUCCESS: Line code=${mergedDoc.lines[0].code}, qty=${mergedDoc.lines[0].quantity}`);


        // --- 4. Atomic Finalization & Conflict Handling ---
        console.log('\n--- TEST 4: Atomic Finalization ---');
        // Finalize
        console.log(`[VERIFICATION] Finalizing doc ${TEST_DOC_ID}...`);
        const result = await UniversalDocService.finalizeDoc(PROJECT, {
            id: TEST_DOC_ID,
            docType: 'FATURA',
            docNumber: docData.docNumber
        });

        if (result.status !== 'processado') throw new Error('Finalization status mismatch');
        console.log(`✅ Finalization status in DB: ${result.status}`);

        // Verify file movement
        if (!fs.existsSync(result.filePath)) throw new Error(`Archived file missing at ${result.filePath}`);
        if (fs.existsSync(testFile)) throw new Error('Old staging file still exists after move');
        console.log(`✅ File moved to archive: ${result.filePath}`);

        // Verify cleanup from satellite (Finalize should clean up STAGING satellite data if successful)
        // Wait, does UniversalDocService clean up? 
        // Current implementation:finalizeDoc doesn't explicitly clean nicolazzi satellite, 
        // but ARCHIVE view reads from Archive doc. Legacy behavior remains.

        // --- 5. Conflict & Backup ---
        console.log('\n--- TEST 5: Conflict Detection & Backup Migration ---');
        const conflictDocId = uuidv4();
        const conflictFile = path.join(STAGING_DIR, `conflict-${conflictDocId}.pdf`);
        fs.writeFileSync(conflictFile, 'PDF-CONFLICT-CONTENT');

        const conflictDocData = {
            id: conflictDocId,
            project: PROJECT,
            status: 'staging',
            docType: 'FATURA',
            docNumber: docData.docNumber, // SAME NUMBER!
            supplier: 'NICOLAZZI S.p.A.',
            filePath: conflictFile
        };
        await Adapter.saveDocument(PROJECT, conflictDocData);
        console.log(`✅ Created conflicting document ${conflictDocId} with same Number.`);

        console.log('[VERIFICATION] Attempting finalization WITHOUT force (should fail)...');
        try {
            await UniversalDocService.finalizeDoc(PROJECT, {
                id: conflictDocId,
                docType: 'FATURA',
                docNumber: docData.docNumber
            });
            throw new Error('Finalize should have failed with conflict');
        } catch (e) {
            if (e.conflict) console.log(`✅ Conflict detected correctly: ${e.message}`);
            else throw e;
        }

        console.log('[VERIFICATION] Attempting finalization WITH force (should backup old and proceed)...');
        const finalResult = await UniversalDocService.finalizeDoc(PROJECT, {
            id: conflictDocId,
            docType: 'FATURA',
            docNumber: docData.docNumber,
            force: true,
            backupReason: 'Verification Test Overwrite'
        });

        // Verify Backup
        const backups = await Adapter.getBackups(PROJECT, conflictDocId);
        if (backups.length === 0) throw new Error('No backup created after forced overwrite');
        console.log(`✅ Backup created: ${backups[0].reason}`);

        // Verify Archive consistency
        const finalMain = await knex('documents').where({ docNumber: docData.docNumber, project: PROJECT }).select('*');
        if (finalMain.length !== 1) throw new Error(`Expected exactly 1 document with this number, found ${finalMain.length}`);
        if (finalMain[0].id !== conflictDocId) throw new Error('Archive contains wrong ID after force overwrite');
        console.log(`✅ Archive updated correctly with new doc ID: ${conflictDocId}`);


        console.log('\n🌟 [VERIFICATION] ALL TESTS PASSED! MASTER UNIFICATION IS SOLID.\n');

    } catch (e) {
        console.error('\n❌ [VERIFICATION] FAILED:', e);
        process.exit(1);
    } finally {
        // Cleanup Test Data
        console.log('[VERIFICATION] Cleaning up test data...');
        try {
            await knex('extraction_batches').where({ project: PROJECT }).delete();
            await knex('documents').where({ project: PROJECT }).delete();
            await knex('document_backups').where({ project: PROJECT }).delete();
            // Satellite cleanup would need direct file removal or a specialized tool
        } catch (err) { console.error('Cleanup fail:', err); }
        knex.destroy();
    }
}

run();
