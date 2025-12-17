const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M3: Exports ---');
        const headers = await getAuthHeaders();
        // Calling export endpoint (might trigger empty file but should 200)
        // Ensure POST method as per routes
        const url = 'http://localhost:3000/api/export.xlsx?project=default';
        console.log(`POST ${url}`);

        const res = await axios.post(url, {}, { headers, responseType: 'arraybuffer' });
        console.log('Status:', res.status);
        console.log('Bytes:', res.data.length);

        if (res.status === 200 && res.data.length > 0) {
            console.log('✅ Exports Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Exports Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Exports Smoke Failed:', e.message);
        process.exit(1);
    }
})();
