require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

async function assert(condition, msg) {
    if (!condition) {
        console.error("❌ FAIL: " + msg);
        process.exit(1);
    }
    console.log("✅ PASS: " + msg);
}

async function verifyFail(promise, msg) {
    try {
        await promise;
        console.error("❌ FAIL: Should have failed - " + msg);
        process.exit(1);
    } catch (e) {
        console.log("✅ PASS: Failed as expected (" + msg + ") - " + ((e.response && e.response.data && e.response.data.error) || e.message));
    }
}

async function run() {
    try {
        console.log("=== STARTING EXHAUSTIVE VERIFICATION ===");

        // 1. Authenticate
        console.log("\n1. Authenticating...");
        const REAL_SECRET = 'dev-secret-fix-login';
        const token = jwt.sign({
            userId: 'e86f5b2d-3bd7-444c-8fea-52cc31c7f0bc',
            role: 'admin',
            orgId: 'ce5ea034-7f80-4161-be83-b5b79e39eb1b'
        }, REAL_SECRET, { expiresIn: '1h' });

        const authHeaders = { Authorization: `Bearer ${token}` };
        const client = axios.create({ headers: authHeaders, baseURL: BASE_URL });

        // --- DOSSIERS TESTS ---
        console.log("\n--- TESTING DOSSIERS ---");

        // 2. Create Node
        const rootName = 'Root_' + Date.now();
        const root = (await client.post('/dossiers/nodes', { name: rootName })).data;
        assert(root.id && root.name === rootName, "Root Created");

        // 3. Search Nodes
        const searchRes = (await client.get('/dossiers/search', { params: { q: 'Root_' } })).data;
        assert(searchRes.length > 0 && searchRes.find(n => n.id === root.id), "Search found Root");

        // 4. Update Node
        const updatedRoot = (await client.patch(`/dossiers/nodes/${root.id}`, { name: rootName + '_Updated' })).data;
        assert(updatedRoot.name === rootName + '_Updated', "Root Updated");

        // 5. Archive Node
        const archivedRoot = (await client.patch(`/dossiers/nodes/${root.id}`, { archived: true })).data;
        const rootArchivedBool = archivedRoot.archived === true || archivedRoot.archived === 1;
        assert(rootArchivedBool, "Root Archived");


        // --- LABELS TESTS ---
        console.log("\n--- TESTING LABELS ---");

        // 6. List Labels (Empty or existing)
        const initialLabels = (await client.get('/labels')).data;
        assert(Array.isArray(initialLabels), "Labels List returned array");

        // 7. Create Label
        const labelName = 'TestLabel_' + Date.now();
        const newLabel = (await client.post('/labels', {
            name: labelName,
            color: '#FF0000',
            icon_type: 'library',
            icon_value: 'star'
        })).data;
        assert(newLabel.id && newLabel.name === labelName, "Label Created");

        // 8. Get Labels lists new label
        const listAfter = (await client.get('/labels')).data;
        assert(listAfter.find(l => l.id === newLabel.id), "Label found in list");

        // 9. Update Label
        const updatedLabel = (await client.patch(`/labels/${newLabel.id}`, { color: '#00FF00' })).data;
        assert(updatedLabel.color === '#00FF00', "Label Color Updated");

        // 10. Delete Label (Archive)
        const deleteRes = (await client.delete(`/labels/${newLabel.id}`)).data;
        assert(deleteRes.success === true, "Delete Label returned success");

        // 11. Verify Archived (Should NOT be in default list)
        const listFinal = (await client.get('/labels')).data;
        assert(!listFinal.find(l => l.id === newLabel.id), "Archived Label NOT in default list");

        // 12. Verify Archived (Should be in archived=true list)
        const listArchived = (await client.get('/labels', { params: { archived: 'true' } })).data;
        // SQLite boolean handling
        const foundArchived = listArchived.find(l => l.id === newLabel.id);
        assert(foundArchived, "Archived Label found in archived list");

        // --- NODE LABELS TESTS ---
        console.log("\n--- TESTING NODE LABELS ---");
        // Create fresh label
        const nodeLabel = (await client.post('/labels', { name: 'NodeTag', color: '#123456', icon_type: 'library', icon_value: 'tag' })).data;

        // Assign to Root Node (using PUT /api/node-labels/:nodeId)
        // Wait, did I mount it at /api/node-labels? Yes in app.js.
        const assignRes = (await client.put(`/node-labels/${root.id}`, { labelIds: [nodeLabel.id] })).data;
        assert(assignRes.some(l => l.id === nodeLabel.id), "Label assigned via PUT");

        // Verify via GET
        const getLabelsRes = (await client.get(`/node-labels/${root.id}`)).data;
        assert(getLabelsRes.some(l => l.id === nodeLabel.id), "Label retrieved via GET /node-labels/:id");

        console.log("\n=== ALL TESTS PASSED SUCCESSFULLY (200 OK) ===");
        process.exit(0);

    } catch (e) {
        console.error("\n❌ TEST FAILED");
        if (e.response) {
            console.error(`Status: ${e.response.status}`);
            console.error(`Data:`, e.response.data);
            console.error(`URL: ${e.config.url}`);
        } else {
            console.error(e.message);
        }
        process.exit(1);
    }
}

run();
