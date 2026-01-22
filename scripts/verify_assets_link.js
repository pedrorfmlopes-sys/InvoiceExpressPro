require('dotenv').config();
const DossierService = require('../server/src/modules/dossiers/service');
const AssetsService = require('../server/src/modules/assets/service');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function run() {
    try {
        console.log("=== VERIFYING ASSETS & DOSSIER LINK ===");

        // 1. Create Asset
        const assetId = uuidv4();
        await knex('assets').insert({
            id: assetId,
            kind: 'icon',
            mime_type: 'image/fake',
            original_filename: 'test_icon.png',
            storage_path: 'test_icon.png',
            size_bytes: 123,
            sha256: 'fakehash',
            created_by: 'test-script'
        });
        console.log("Created Asset:", assetId);

        // 2. Create Node
        const node = await DossierService.createNode({
            name: 'Icon Test Node',
            created_by: 'test-user'
        });
        console.log("Created Node:", node.id);

        // 3. Link Asset
        await DossierService.updateNode(node.id, { icon_asset_id: assetId });
        console.log("Linked Asset to Node");

        // 4. Verify Link
        const updated = await DossierService.getNode(node.id);
        if (updated.icon_asset_id === assetId) {
            console.log("✅ PASS: Node has correct icon_asset_id");
        } else {
            console.error("❌ FAIL: icon_asset_id mismatch", updated.icon_asset_id);
        }

        // 5. Test List Nodes (Optional, check if it comes through)
        const list = await DossierService.listNodes();
        const found = list.find(n => n.id === node.id);
        if (found && found.icon_asset_id === assetId) {
            console.log("✅ PASS: ListNodes returns icon_asset_id");
        } else {
            console.error("❌ FAIL: ListNodes missing icon_asset_id");
        }

        // 6. Test Delete Asset Constraint (SET NULL)
        await AssetsService.delete(assetId);
        console.log("Deleted Asset");

        const nodeAfterDelete = await DossierService.getNode(node.id);
        if (nodeAfterDelete.icon_asset_id === null) {
            console.log("✅ PASS: Node icon_asset_id set to NULL after asset deletion");
        } else {
            console.error("❌ FAIL: Node icon_asset_id NOT NULL", nodeAfterDelete.icon_asset_id);
        }

        // Cleanup
        await DossierService.deleteNode(node.id);
        await knex('dossier_nodes').where({ id: node.id }).del();

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

run();
