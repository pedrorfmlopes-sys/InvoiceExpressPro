const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

const API_URL = 'http://localhost:3000/api';

async function verify() {
    try {
        console.log("Verifying UI Config Endpoint...");
        const headers = await getAuthHeaders();

        // 1. GET /api/config/ui
        console.log("1. GET /api/config/ui");
        const res = await axios.get(`${API_URL}/config/ui`, { headers });
        console.log("   Result:", res.data);

        // 2. PUT /api/config/ui coverage
        console.log("2. UPDATE /api/config/ui");
        const update = {
            card: { menuName: 'Teste Config' },
            sidebar: { hidden: [] }
        };
        const res2 = await axios.put(`${API_URL}/config/ui`, update, { headers });
        console.log("   Result:", res2.data);

        console.log("PASS: UI Config Verified.");
    } catch (e) {
        console.error("FAIL:", e.message);
        if (e.response) console.error("Data:", e.response.data);
        process.exit(1);
    }
}

verify();
