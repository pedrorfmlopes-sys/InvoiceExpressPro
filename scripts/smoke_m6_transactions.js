const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M6: Transactions ---');
        const headers = await getAuthHeaders();
        // Transactions module usually on /api/transactions
        // Need a safe GET. Maybe /api/transactions/stats or just list?
        // Checking routes... Assuming /api/transactions/ is list or stats
        // If not, we might get 404 or 400.
        // Let's try root /api/transactions
        const url = 'http://localhost:3000/api/transactions';
        console.log(`GET ${url}`);
        const res = await axios.get(url, { headers });
        console.log('Status:', res.status);

        if (res.status === 200) {
            console.log('✅ Transactions Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Transactions Smoke Failed');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Transactions Smoke Failed:', e.message);
        process.exit(1);
    }
})();
