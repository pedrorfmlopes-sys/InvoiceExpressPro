/**
 * verify_archive_patch.js
 * Verifies that patching a document in the archive does NOT cause rawJson nesting.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const Adapter = require('../server/src/storage/getDocsAdapter');
const knex = require('../server/src/db/knex');

async function verifyArchivePatch() {
    console.log('--- VERIFYING ARCHIVE PATCH (NO RECURSION) ---');
    const project = 'verify_patch_test';
    const id = 'doc-patch-test-' + Date.now();

    try {
        // 1. Seed doc
        const originalDoc = {
            id,
            project,
            docNumber: 'PATCH-001',
            status: 'processado',
            total: 100,
            created_at: new Date(),
            updated_at: new Date(),
            rawJson: JSON.stringify({ id, total: 100, note: 'original' })
        };
        await Adapter.saveDocument(project, originalDoc);
        console.log('STEP 1: Seeded document.');

        // 2. Patch with Adapter.updateDoc
        console.log('STEP 2: Patching (Total 100 -> 200)...');
        await Adapter.updateDoc(project, id, { total: 200, notes: 'patched' });

        // 3. Verify Recursion
        const patched = await knex('documents').where({ id }).first();
        const raw = JSON.parse(patched.rawJson);

        console.log('Verifying rawJson structure:');
        console.log(JSON.stringify(raw, null, 2));

        if (raw.rawJson) {
            throw new Error('FAILED: rawJson is NESTED!');
        }

        if (patched.total !== 200) {
            throw new Error('FAILED: Total not updated in DB.');
        }

        console.log('SUCCESS: No recursion detected. Data updated correctly.');

    } catch (e) {
        console.error('VERIFICATION FAILED:', e.message);
        process.exit(1);
    } finally {
        await knex('documents').where({ project }).delete();
        await knex.destroy();
    }
}

verifyArchivePatch();
