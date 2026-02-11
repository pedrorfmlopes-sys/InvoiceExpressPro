
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

(async () => {
    console.log('\n--- STRESS TEST: CONCURRENT OVERWRITE ---\n');
    const project = 'Proj_2026';
    const supplierName = 'STRESS_SUPPLIER_' + Date.now();
    const docNumber = 'STRESS-' + Date.now();

    // 1. Setup Initial Document
    const docId1 = uuidv4();
    await knex('documents').insert({
        id: docId1, project, docNumber, docType: 'proforma', supplier: supplierName,
        total: 100, status: 'finalized', rawJson: '{}', created_at: new Date(), updated_at: new Date()
    });
    console.log(`[Setup] Created Base Document (ID: ${docId1})`);

    // 2. Prepare 3 concurrent overwrites
    // Different IDs, but same DocNumber/Supplier -> ALL CONFLICT with the Base Document (or each other)
    const attackerIds = [uuidv4(), uuidv4(), uuidv4()];

    // We need to create these "staging" documents in DB first so controller finds them
    for (const id of attackerIds) {
        await knex('documents').insert({
            id, project, docNumber, docType: 'proforma', supplier: supplierName,
            total: 200, status: 'extracted', rawJson: '{}', created_at: new Date(), updated_at: new Date()
        });
    }
    console.log(`[Setup] Created 3 Attacker Documents:`, attackerIds);

    // 3. Launch Requests in Parallel
    console.log(`[Action] Launching 3 concurrent finalizeBulk(force=true)...`);

    // We map each request to a promise
    const promises = attackerIds.map(id => {
        return (async () => {
            const req = mockReq({ items: [{ id }], force: true, backupReason: 'Concurrent Stress' }, project);
            const res = mockRes();
            try {
                await CoreV2Controller.finalizeBulk(req, res);
                return { id, res: res.data };
            } catch (e) {
                return { id, error: e.message };
            }
        })();
    });

    const results = await Promise.all(promises);

    // 4. Analyze Results
    console.log('\n--- RESULTS ---');
    results.forEach(r => {
        if (r.error) console.log(`[${r.id}] ERROR:`, r.error);
        else console.log(`[${r.id}] OK:`, r.res.ok ? 'Success' : 'Fail', r.res.results?.[0]?.ok);
    });

    // 5. Inspect Database Integrity
    console.log('\n--- INTEGRITY CHECK ---');

    // How many documents exist with this number? Should be exactly 1 (the winner)
    const survivors = await knex('documents').where({ project, docNumber, supplier: supplierName }).select('id');
    console.log(`Survivors (Should be 1): ${survivors.length} -> IDs:`, survivors.map(s => s.id));

    // How many backups exist for the Base Document? (Should be migrated to the Winner)
    // The Base Doc ID (docId1) is gone. Its backups should point to the Winner.
    // AND the losers should also have been backed up?

    if (survivors.length === 1) {
        const winnerId = survivors[0].id;
        const backups = await knex('document_backups').where({ original_doc_id: winnerId });
        console.log(`Backups attached to Winner (${winnerId}): ${backups.length}`);
        backups.forEach(b => console.log(` - Backup ID: ${b.id}, Reason: ${b.reason}`));
    } else {
        console.error('CRITICAL: Split brain or data loss! Multiple or Zero documents active.');
    }

    // cleanup
    // await knex('documents').where({ project, docNumber }).delete(); 
    process.exit(0);

})();
