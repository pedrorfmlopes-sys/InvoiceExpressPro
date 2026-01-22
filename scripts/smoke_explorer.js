const axios = require('axios');
const API_URL = 'http://localhost:3000/api';

async function test() {
    try {
        console.log("0. Authenticating...");
        const login = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@smoke.test',
            password: 'password123'
        });
        const token = login.data.token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log("Authenticated.");

        console.log("1. Testing Get Docs...");
        const res = await axios.get(`${API_URL}/explorer/docs?project=ALL`, { headers });
        console.log("Docs Status:", res.status);
        console.log("Docs Count:", res.data.rows ? res.data.rows.length : 0);

        console.log("2. Testing Prefs...");
        await axios.put(`${API_URL}/explorer/prefs/smoke_test?project=GLOBAL`, { test: 123 }, { headers });
        const prefs = await axios.get(`${API_URL}/explorer/prefs/smoke_test?project=GLOBAL`, { headers });
        console.log("Prefs Value:", prefs.data);

        console.log("3. Testing Metadata Listeners...");
        const cats = await axios.get(`${API_URL}/explorer/categories?project=ALL`, { headers });
        console.log("Categories:", cats.data.length);

        console.log("SUCCESS");
    } catch (e) {
        console.error("FAIL Message:", e.message);
        if (e.code) console.error("FAIL Code:", e.code);
        if (e.response) {
            console.error("FAIL Status:", e.response.status);
            console.error("FAIL Data:", JSON.stringify(e.response.data));
        }
    }
}
test();
