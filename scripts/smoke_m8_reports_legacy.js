const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M8: Reports Legacy ---');
        const headers = await getAuthHeaders();
        const url = 'http://localhost:3000/api/reports/suppliers';
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log('Status:', res.status);

        if (res.status === 200) {
            console.log('✅ Reports Legacy Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Reports Legacy Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Reports Legacy Smoke Failed:', e.message);
        process.exit(1);
    }
})();
