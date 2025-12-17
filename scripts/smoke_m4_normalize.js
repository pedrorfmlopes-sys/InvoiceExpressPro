const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M4: Normalize ---');
        const headers = await getAuthHeaders();
        const url = 'http://localhost:3000/api/normalize?project=default';
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log('Status:', res.status);

        if (res.status === 200 && res.data.ok === true) {
            console.log('✅ Normalize Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Normalize Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Normalize Smoke Failed:', e.message);
        if (e.response) console.error('Response:', e.response.data);
        process.exit(1);
    }
})();
