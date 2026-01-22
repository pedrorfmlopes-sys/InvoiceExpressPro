const axios = require('axios');
const API_URL = 'http://localhost:3000/api';
// Auth logic
const { getAuthHeaders } = require('./smoke_utils');

async function verify() {
    try {
        console.log("Verifying Extraction Module...");
        const headers = await getAuthHeaders();

        // 1. List
        console.log("1. List Profiles...");
        const listRes = await axios.get(`${API_URL}/extraction/profiles`, { headers });
        console.log("   Profiles count:", listRes.data.length);

        // 2. Create
        console.log("2. Create Profile...");
        const payload = {
            name: "Test Profile " + Date.now(),
            doc_type: "invoice",
            priority: 5,
            signatures: [{ keyword: "TEST_KEYWORD", weight: 10 }]
        };
        const createRes = await axios.post(`${API_URL}/extraction/profiles`, payload, { headers });
        const profileId = createRes.data.id;
        if (!profileId) throw new Error("No ID returned");
        console.log("   Created ID:", profileId);

        // 3. Get
        console.log("3. Get Profile...");
        const getRes = await axios.get(`${API_URL}/extraction/profiles/${profileId}`, { headers });
        if (getRes.data.name !== payload.name) throw new Error("Name mismatch");
        if (getRes.data.signatures.length !== 1) throw new Error("Signatures mismatch");
        console.log("   Verified Profile Data.");

        // 4. Delete
        console.log("4. Delete Profile...");
        await axios.delete(`${API_URL}/extraction/profiles/${profileId}`, { headers });
        console.log("   Deleted.");

        console.log("PASS: Extraction Module Verified.");
    } catch (e) {
        console.error("FAIL:", e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    }
}

verify();
