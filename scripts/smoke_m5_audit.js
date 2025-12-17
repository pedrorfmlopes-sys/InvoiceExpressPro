const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M5: Audit ---');
        const headers = await getAuthHeaders();
        const url = 'http://localhost:3000/api/audit?project=default';
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log('Status:', res.status);

        if (res.status === 200 && Array.isArray(res.data)) {
            console.log('✅ Audit Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Audit Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Audit Smoke Failed:', e.message);
        process.exit(1);
    }
})();
