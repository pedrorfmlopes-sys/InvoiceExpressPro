const axios = require('axios');

(async () => {
    try {
        console.log('--- Health Module Smoke Test ---');
        const url = 'http://localhost:3000/api/health/modules';
        console.log(`GET ${url}`);
        const res = await axios.get(url);
        console.log('Status:', res.status);
        console.log('Body:', JSON.stringify(res.data, null, 2));

        if (res.status === 200 && res.data.ok === true && Array.isArray(res.data.modules)) {
            console.log('✅ Health Smoke Passed!');
            process.exit(0);
        } else {
            console.error('❌ Health Smoke Failed: Invalid response structure');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Health Smoke Failed:', e.message);
        if (e.response) console.error('Response:', e.response.data);
        process.exit(1);
    }
})();
