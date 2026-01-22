const axios = require('axios');
const API_URL = 'http://localhost:3000/api';
// Auth logic
const { getAuthHeaders } = require('./smoke_utils');

async function verify() {
    try {
        console.log("Verifying Counts...");
        const headers = await getAuthHeaders();
        const project = 'verify_counts'; // using default project? Or query param?

        // 1. Create Parent Node
        console.log("Creating Parent...");
        const parentRes = await axios.post(`${API_URL}/dossiers/nodes`, { name: 'Parent ' + Date.now() }, { headers });
        const parentId = parentRes.data.id;

        // 2. Create Child Node
        console.log("Creating Child...");
        await axios.post(`${API_URL}/dossiers/nodes`, { name: 'Child', parentId }, { headers });

        // 3. Link Document (assuming a doc exists or just check child count first)
        // Linking doc requires a docId. We need to find one or create stub.
        // Actually, let's just check child count.

        // 4. List Nodes
        const listRes = await axios.get(`${API_URL}/dossiers/nodes?parentId=null`, { headers });
        const parent = listRes.data.find(n => n.id === parentId);

        if (!parent) throw new Error("Parent not found in list");

        console.log(`Parent Child Count: ${parent.child_count}`);
        if (parent.child_count !== 1) throw new Error(`Expected child_count 1, got ${parent.child_count}`);

        console.log("PASS: Child Count verified.");

        // Cleanup?
    } catch (e) {
        console.error("FAIL:", e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    }
}

verify();
