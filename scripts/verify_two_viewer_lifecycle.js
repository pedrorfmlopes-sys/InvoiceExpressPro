/**
 * verify_two_viewer_lifecycle.js
 * Verifies the isolation between Staging (Satellite) and Archive (Main DB) modes.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const Adapter = require('../server/src/storage/getDocsAdapter');
const knex = require('../server/src/db/knex');
const sqlite3 = require('sqlite3').verbose();
const { PATHS } = require('../server/src/config/constants');

async function runTest() {
    console.log('=== VERIFYING TWO-VIEWER ISOLATION ===');
    const project = 'verify_viewer_test';
    const id = 'doc-viewer-test-' + Date.now();
    const satDbPath = path.join(PATHS.EXTRACTORS_DIR, 'nicolazzi_proformas.sqlite');

    try {
        // 1. Seed Main DB (Status: uploaded)
        const doc = {
            id, project, docNumber: 'VIEWER-001', status: 'uploaded', total: 100,
            created_at: new Date(), updated_at: new Date()
        };
        await Adapter.saveDocument(project, doc);
        console.log('STEP 1: Document seeded in Main DB.');

        // 2. Simulate Staging Edit (Satellite)
        console.log('STEP 2: Simulating Staging Edit (Satellite)...');
        const db = new sqlite3.Database(satDbPath);
        await new Promise((resolve, reject) => {
            db.run("INSERT OR REPLACE INTO extractions (docId, dataJson) VALUES (?, ?)",
                [id, JSON.stringify({ id, total: 555.55, note: 'satellite' })],
                (err) => err ? reject(err) : resolve()
            );
        });
        db.close();

        // Verify Main DB is NOT touched
        const mainAfterSat = await Adapter.getDoc(project, id);
        if (mainAfterSat.total === 100) {
            console.log('✅ ISOLATION OK: Satellite edit did not affect Main DB.');
        } else {
            throw new Error('FAILED: Satellite edit corrupted Main DB!');
        }

        // 3. Simulate Archive Edit (Direct)
        console.log('STEP 3: Simulating Archive Edit (Direct)...');
        // Update total to 999.99 directly in Main DB
        await Adapter.updateDoc(project, id, { total: 999.99 });

        const mainAfterDirect = await Adapter.getDoc(project, id);
        if (mainAfterDirect.total === 999.99) {
            console.log('✅ ARCHIVE OK: Direct edit updated Main DB.');
        } else {
            throw new Error('FAILED: Direct edit did not update Main DB!');
        }

        console.log('=== TEST SUCCESSFUL ===');

    } catch (e) {
        console.error('VERIFICATION FAILED:', e.message);
        process.exit(1);
    } finally {
        await knex('documents').where({ project }).delete();
        await knex.destroy();
    }
}

runTest();
