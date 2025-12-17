const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M1: Docs ---');
        const headers = await getAuthHeaders();
        // Using /api/excel.json as it is a known valid GET route in docs module
        const url = 'http://localhost:3000/api/excel.json';

        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        // console.log('Status:', res.status);

        if (res.status === 200 && (Array.isArray(res.data) || res.data?.rows || res.data?.items)) {
            console.log('✅ Docs Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Docs Smoke Failed: Invalid structure');
            console.log('Keys:', Object.keys(res.data));
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Docs Smoke Failed:', e.message);
        if (e.response) console.log(e.response.data);
        process.exit(1);
    }
})();
