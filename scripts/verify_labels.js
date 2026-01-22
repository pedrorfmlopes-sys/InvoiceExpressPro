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
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod'; // Fallback if env missing in shell context
        // Try reading .env content logic if needed, but assuming process.env is populated or defaults match.
        // Actually, previous step revealed secret is `dev-secret-fix-login` in .env.
        // I will use that or hardcode it again to be safe.
        const REAL_SECRET = 'dev-secret-fix-login';

        const token = jwt.sign({
            userId: 'e86f5b2d-3bd7-444c-8fea-52cc31c7f0bc',
            role: 'admin',
            orgId: 'ce5ea034-7f80-4161-be83-b5b79e39eb1b'
        }, REAL_SECRET, { expiresIn: '1h' });

        const authHeaders = { Authorization: `Bearer ${token}` };
        const client = axios.create({ headers: authHeaders, baseURL: BASE_URL });

        // 2. Create Global Label
        console.log("2. Create Global Label...");
        const globalLblName = "Global Test " + Date.now();
        const resGlobal = await client.post('/labels', {
            name: globalLblName,
            color: '#000000',
            project: null
        });
        assert(resGlobal.status === 200, "Global Label Created");
        const globalId = resGlobal.data.id;

        // 3. Create Project Label
        console.log("3. Create Project Label...");
        const projLblName = "Project Test " + Date.now();
        const resProj = await client.post('/labels', {
            name: projLblName,
            color: '#ff0000',
            project: 'default' // Assuming 'default' project exists from previous contexts
        });
        assert(resProj.status === 200, "Project Label Created");
        const projId = resProj.data.id;

        // 4. Duplicate Name Check
        console.log("4. Duplicate Name Check...");
        await verifyFail(
            client.post('/labels', { name: projLblName, project: 'default' }),
            "Duplicate Name in Project"
        );

        // 5. Assign to Doc
        // Need a doc ID. 
        // I'll grab one via explorer list if possible, or use one known from previous steps (1de7f6ac-7982-4c62-9b36-0677f2d645df)
        const docId = '1de7f6ac-7982-4c62-9b36-0677f2d645df';
        console.log("5. Assigning Labels to Doc...");
        const resAssign = await client.put(`/doc-labels/${docId}`, {
            labelIds: [globalId, projId]
        });
        assert(resAssign.status === 200, "Assigned Labels");
        assert(resAssign.data.length === 2, "Returned 2 labels");

        // 6. Get Doc Labels
        console.log("6. Get Doc Labels...");
        const resGet = await client.get(`/doc-labels/${docId}`);
        assert(resGet.data.find(l => l.id === globalId), "Global Label found");
        assert(resGet.data.find(l => l.id === projId), "Project Label found");

        // 7. Fail Cross-Project
        console.log("7. Testing Cross-Project Fail...");
        // Create label in 'other-project'
        const otherLblRes = await client.post('/labels', {
            name: "Other " + Date.now(),
            project: 'other-project'
        });
        const otherId = otherLblRes.data.id;

        await verifyFail(
            client.put(`/doc-labels/${docId}`, { labelIds: [otherId] }),
            "Assigning Other Project Label"
        );

        // 8. Fail Archived
        console.log("8. Testing Archived Fail...");
        // Archive the Global Label
        await client.patch(`/labels/${globalId}`, { archived: true });

        await verifyFail(
            client.put(`/doc-labels/${docId}`, { labelIds: [globalId] }),
            "Assigning Archived Label"
        );

        // 9. List & Filter
        console.log("9. List & Filter...");
        // Unarchive global first to test visibility
        await client.patch(`/labels/${globalId}`, { archived: false });

        const resList = await client.get('/labels', { params: { project: 'default' } });
        assert(resList.status === 200, "List Labels 200 OK");
        // Should contain globalId and projId
        const hasGlobal = resList.data.find(l => l.id === globalId);
        const hasProj = resList.data.find(l => l.id === projId);
        assert(hasGlobal && hasProj, "List contains both Global and Project labels");

        // 10. Update Label
        console.log("10. Update Label...");
        const newName = "Updated Project Label " + Date.now();
        const resUpdate = await client.patch(`/labels/${projId}`, {
            name: newName,
            color: '#00ff00'
        });
        assert(resUpdate.status === 200, "Update Label 200 OK");
        assert(resUpdate.data.name === newName, "Name Updated");
        assert(resUpdate.data.color === '#00ff00', "Color Updated");

        // 11. Clear Labels (Unassign)
        console.log("11. Clear Labels...");
        const resClear = await client.put(`/doc-labels/${docId}`, { labelIds: [] });
        assert(resClear.status === 200, "Clear Labels 200 OK");
        assert(resClear.data.length === 0, "Labels list is empty");

        console.log("ALL TESTS PASSED - SYSTEM ROBUST");
        process.exit(0);

    } catch (e) {
        console.error("TEST FAILED", e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

run();
