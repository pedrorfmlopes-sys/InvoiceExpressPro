const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M2: Processing ---');
        const headers = await getAuthHeaders();
        // Check batch progress of a non-existent batch to verifying routing without side-effects
        const url = 'http://localhost:3000/api/progress/smoke-test-batch-id';

        console.log(`GET ${url}`);
        try {
            await axios.get(url, { headers });
        } catch (e) {
            if (e.response && e.response.status === 404) {
                console.log('✅ Processing Smoke Passed (404 expected/handled correctly by controller)');
                process.exit(0);
            }
            throw e;
        }
    } catch (e) {
        console.error('❌ Processing Smoke Failed:', e.message);
        process.exit(1);
    }
})();
