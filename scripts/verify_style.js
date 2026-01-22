require('dotenv').config();
const DossierService = require('../server/src/modules/dossiers/service');
const knex = require('../server/src/db/knex');

async function run() {
    try {
        console.log("=== VERIFYING STYLE PERSISTENCE (DIRECT SERVICE) ===");

        // 1. Create Node
        const node = await DossierService.createNode({
            name: 'StyleTest',
            created_by: 'test-user'
        });
        console.log("Created Node:", node.id);

        // 2. Update Style
        const styleObj = { bgColor: 'bg-red-500', shadow: 'shadow-xl', colSpan: 'col-span-2' };

        // Simulate Controller passing object
        await DossierService.updateNode(node.id, { style: styleObj });
        console.log("Updated Style");

        // 3. Get Node directly from DB to verify persistence format
        // We use knex raw to see what's actually there if possible, or just Service.getNode
        const updated = await DossierService.getNode(node.id);

        console.log("Retrieved Node Type of Style:", typeof updated.style);
        console.log("Value:", updated.style);

        // Logic check
        let parsedStyle = updated.style;
        if (typeof parsedStyle === 'string') {
            try {
                parsedStyle = JSON.parse(parsedStyle);
            } catch (e) {
                console.error("JSON Parse Error:", e.message);
            }
        }

        if (parsedStyle && parsedStyle.bgColor === 'bg-red-500') {
            console.log("✅ PASS: Style persisted correctly");
        } else {
            console.error("❌ FAIL: Style content mismatch or invalid format");
        }

        // Cleanup
        await DossierService.deleteNode(node.id); // Or archive
        // Manual delete to be clean
        await knex('dossier_nodes').where({ id: node.id }).del();

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

run();
