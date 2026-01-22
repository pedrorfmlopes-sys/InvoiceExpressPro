const axios = require('axios');
const API_URL = 'http://localhost:3000/api';

async function test() {
    try {
        // 1. Auth
        const login = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@smoke.test',
            password: 'password123'
        });
        const headers = { Authorization: `Bearer ${login.data.token}` };

        // 2. Get Docs
        const docsRes = await axios.get(`${API_URL}/explorer/docs?limit=2`, { headers });
        const docs = docsRes.data.rows;
        if (docs.length < 2) {
            console.log("Not enough docs to link.");
            return;
        }

        const ids = [docs[0].id, docs[1].id];
        console.log(`Linking docs: ${ids.join(', ')}`);

        // 3. Link
        const linkRes = await axios.post(`${API_URL}/explorer/links`, { docIds: ids }, { headers });
        console.log("Link Status:", linkRes.status); // Should be 200
        console.log("Link Group:", linkRes.data.groupId);

        // 4. Verify (Optional, not exposed in simple GET docs, but maybe specific endpoint?)
        // The service has `getLinks(docId)`. Do we have a route for it?
        // Routes: router.get('/links/:docId', ...)
        const verifyRes = await axios.get(`${API_URL}/explorer/links/${ids[0]}`, { headers });
        console.log("Linked Docs Count:", verifyRes.data.length);

        if (verifyRes.data.find(d => d.id === ids[1])) {
            console.log("SUCCESS: Link verified.");
        } else {
            console.error("FAIL: Link not found.");
        }

    } catch (e) {
        console.error("FAIL:", e.message);
        if (e.response) console.error(e.response.data);
    }
}
test();
