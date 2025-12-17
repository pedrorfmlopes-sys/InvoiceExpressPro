const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M9: Reports V2 ---');
        const headers = await getAuthHeaders();
        const url = 'http://localhost:3000/api/v2/reports/summary';
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log('Status:', res.status);

        if (res.status === 200) {
            console.log('✅ Reports V2 Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Reports V2 Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Reports V2 Smoke Failed:', e.message);
        process.exit(1);
    }
})();
