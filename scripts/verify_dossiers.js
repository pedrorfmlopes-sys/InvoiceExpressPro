require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

async function assert(condition, msg) {
    if (!condition) {
        console.error("FAIL: " + msg);
        process.exit(1);
    }
    console.log("PASS: " + msg);
}

async function verifyFail(promise, msg) {
    try {
        await promise;
        console.error("FAIL: Should have failed - " + msg);
        process.exit(1);
    } catch (e) {
        console.log("PASS: Failed as expected (" + msg + ") - " + ((e.response && e.response.data && e.response.data.error) || e.message));
    }
}

async function run() {
    try {
        console.log("1. Authenticating...");
        const REAL_SECRET = 'dev-secret-fix-login';

        const token = jwt.sign({
            userId: 'e86f5b2d-3bd7-444c-8fea-52cc31c7f0bc',
            role: 'admin',
            orgId: 'ce5ea034-7f80-4161-be83-b5b79e39eb1b'
        }, REAL_SECRET, { expiresIn: '1h' });

        const authHeaders = { Authorization: `Bearer ${token}` };
        const client = axios.create({ headers: authHeaders, baseURL: BASE_URL });

        // 2. Create Hierarchy: Root -> A -> B
        console.log("2. Creating Hierarchy...");
        const root = (await client.post('/dossiers/nodes', { name: 'Root' })).data;
        const nodeA = (await client.post('/dossiers/nodes', { name: 'Node A', parentId: root.id })).data;
        const nodeB = (await client.post('/dossiers/nodes', { name: 'Node B', parentId: nodeA.id })).data;

        assert(root.id, "Root Created");
        assert(nodeA.parent_id === root.id, "Node A linked to Root");
        assert(nodeB.parent_id === nodeA.id, "Node B linked to Node A");

        // 3. Verify Path
        console.log("3. Verifying Path...");
        const pathB = (await client.get(`/dossiers/nodes/${nodeB.id}/path`)).data;
        // Should be [Root, Node A, Node B]
        assert(pathB.length === 3, "Path length is 3");
        assert(pathB[0].id === root.id, "Path starts with Root");
        assert(pathB[1].id === nodeA.id, "Path middle A");
        assert(pathB[2].id === nodeB.id, "Path ends B");

        // 4. Test Cycle Detection
        console.log("4. Testing Cycle Detection (Move Root into B)...");
        // Moving Root to have 'B' as parent. 'B' is descendant of 'Root'. Cycle!
        await verifyFail(
            client.post(`/dossiers/nodes/${root.id}/move`, { parentId: nodeB.id }),
            "Cycle Detection"
        );

        // 5. Test Valid Move
        console.log("5. Testing Valid Move...");
        // Move B to Root (becomes sibling of A)
        const movedB = (await client.post(`/dossiers/nodes/${nodeB.id}/move`, { parentId: root.id })).data;
        assert(movedB.parent_id === root.id, "Node B moved to Root");

        // 6. Links
        console.log("6. Testing Links...");
        await client.post('/dossiers/links', { from: nodeA.id, to: nodeB.id, type: 'related' });
        const linksA = (await client.get(`/dossiers/links/${nodeA.id}`)).data;
        assert(linksA.out.find(l => l.id === nodeB.id), "Link A->B found");

        // 7. Docs Assignment (Replace)
        console.log("7. Testing Doc Assignment...");
        const docId = '1de7f6ac-7982-4c62-9b36-0677f2d645df';
        await client.put(`/dossiers/nodes/${root.id}/docs`, { docIds: [docId] });
        const docs = (await client.get(`/dossiers/nodes/${root.id}/docs`)).data;
        assert(docs.find(d => d.id === docId), "Doc assigned to Root");

        // 8. Replace Docs (Empty to clear)
        await client.put(`/dossiers/nodes/${root.id}/docs`, { docIds: [] });
        const docsEmpty = (await client.get(`/dossiers/nodes/${root.id}/docs`)).data;
        assert(docsEmpty.length === 0, "Doc links cleared");

        // 9. Update Node
        console.log("9. Testing Update Node...");
        const updatedA = (await client.patch(`/dossiers/nodes/${nodeA.id}`, {
            name: 'Node A Updated',
            description: 'Desc updated'
        })).data;
        assert(updatedA.name === 'Node A Updated', "Name updated");
        assert(updatedA.description === 'Desc updated', "Desc updated");

        // 10. List Nodes (Filter)
        console.log("10. Testing List Nodes...");
        const roots = (await client.get('/dossiers/nodes', { params: { parentId: 'null' } })).data;
        // Should find 'Root' (id=root.id). B is child of root (step 5), so B is NOT root.
        assert(roots.find(n => n.id === root.id), "Root found in list");
        assert(!roots.find(n => n.id === nodeB.id), "Child B not found in root list");

        // 11. Remove Link
        console.log("11. Testing Remove Link...");
        await client.delete('/dossiers/links', {
            data: { from: nodeA.id, to: nodeB.id, type: 'related' }
        });
        const linksA2 = (await client.get(`/dossiers/links/${nodeA.id}`)).data;
        assert(!linksA2.out.find(l => l.id === nodeB.id), "Link removed");

        // 12. Archive Node
        console.log("12. Testing Archive Node...");
        const archivedA = (await client.patch(`/dossiers/nodes/${nodeA.id}`, { archived: true })).data;
        // SQLite boolean might be 1/0
        assert(archivedA.archived === true || archivedA.archived === 1, "Node A archived");

        console.log("ALL TESTS PASSED - SYSTEM ROBUST");
        process.exit(0);

    } catch (e) {
        console.error("TEST FAILED", e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

run();
