require('dotenv').config();
const DossierService = require('../server/src/modules/dossiers/service');
const DocService = require('../server/src/modules/docs/service');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function run() {
    try {
        console.log("=== VERIFYING DOC LINKING ===");
        const projectId = 'pedrorfmlopes-sys/InvoiceExpressPro'; // Mock project

        // 1. Create Test Doc
        const docId = uuidv4();
        await knex('documents').insert({
            id: docId,
            project: projectId,
            docNumber: 'TEST-123',
            supplier: 'Test Supplier',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date()
        });
        console.log("Created Doc:", docId);

        // 2. Create Node
        const node = await DossierService.createNode({
            name: 'Link Test Node',
            created_by: 'test-user'
        });
        console.log("Created Node:", node.id);

        // 3. Test Search
        const results = await DocService.searchDocs(projectId, 'TEST-123');
        if (results.length > 0 && results[0].id === docId) {
            console.log("✅ PASS: Search found doc");
        } else {
            console.error("❌ FAIL: Search failed", results);
        }

        // 4. Test Add Link
        await DossierService.addDocLink(node.id, docId);
        console.log("Added Link");

        // 5. Verify Link exists
        const links = await DossierService.getDocs(node.id);
        const linked = links.find(d => d.id === docId);
        if (linked) {
            console.log("✅ PASS: Doc is linked to Node");
        } else {
            console.error("❌ FAIL: Link not found in getDocs", links);
        }

        // Cleanup
        await knex('documents').where({ id: docId }).del();
        await DossierService.deleteNode(node.id);
        await knex('dossier_nodes').where({ id: node.id }).del(); // Deep clean

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

run();
