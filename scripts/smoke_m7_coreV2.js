const axios = require('axios');
const { getAuthHeaders } = require('./smoke_utils');

(async () => {
    try {
        console.log('--- Smoke M7: CoreV2 ---');
        const headers = await getAuthHeaders();
        const url = 'http://localhost:3000/api/v2/doctypes'; // Valid V2 GET
        // CoreV2 router usually aggregates... if no specific health, maybe /api/v2/config? 
        // Let's assume /api/v2/health exists as per standard conventions or fallback to another known endpoint
        // If fails, I will edit.
        console.log(`GET ${url}`);
        try {
            const res = await axios.get(url, { headers });
            if (res.status === 200) {
                console.log('✅ CoreV2 Smoke Passed!');
                process.exit(0);
            }
        } catch (e) {
            // Fallback: check if /api/v2/dashboard or similar exists?
            console.log('Health check failed, trying /api/v2/dashboard-summary (mock)...');
            // Actually, let's just assert it is mounted. 404 on specific might be ok if router is alive but empty path.
            // But better to hit something real.
            throw e;
        }
    } catch (e) {
        console.error('❌ CoreV2 Smoke Failed:', e.message);
        process.exit(1);
    }
})();
