// scripts/smoke_v3_0_reports.js
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const ADMIN_EMAIL = 'admin@smoke.test';
const ADMIN_PASS = 'password123';

const jar = new CookieJar();
const client = wrapper(axios.create({ baseURL: BASE_URL, jar, validateStatus: () => true }));

async function run() {
    console.log('--- V3.0 Reports Smoke Test ---');

    console.log('0. Bootstrap/Login Admin...');
    // Ensure admin exists
    await client.post('/auth/bootstrap', { email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin', orgName: 'SmokeOrg' });

    // Login
    const loginRes = await client.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (loginRes.status !== 200) throw new Error(`Login failed: ${loginRes.status}`);
    const token = loginRes.data.token;
    if (!token) throw new Error('No token');
    console.log('   [PASS] Login OK.');

    // Helper
    const checkReport = async (endpoint, name) => {
        console.log(`Checking ${name} (${endpoint})...`);
        const res = await client.get(endpoint, { headers: { Authorization: `Bearer ${token}` } });

        if (res.status !== 200) {
            console.error('Response Body:', res.data);
            throw new Error(`${name} failed with status ${res.status}`);
        }

        const data = res.data;
        if (!data || !Array.isArray(data.rows)) {
            console.error('Data:', JSON.stringify(data).slice(0, 200));
            throw new Error(`${name} missing 'rows' array in response`);
        }

        console.log(`   [PASS] ${name} OK. Rows: ${data.rows.length}`);
        if (data.rows.length > 0) {
            console.log(`   [INFO] Sample: ${JSON.stringify(data.rows[0])}`);
        }
    };

    // 1. Check Suppliers
    await checkReport('/reports/suppliers', 'Suppliers');

    // 2. Check Monthly
    await checkReport('/reports/monthly', 'Monthly');

    // 3. Check Customers
    await checkReport('/reports/customers', 'Customers');

    // 4. Check Default Project (No ?project=...)
    console.log('4. Check Default Project fallback...');
    // We already used client with baseURL, but let's be explicit we are NOT passing ?project
    // The previous calls didn't pass ?project anyway so they were relying on the bug or previous behavior,
    // BUT now we confirmed we added the fallback.
    // Let's explicitly check one endpoint again to be sure it doesn't 500.
    await checkReport('/reports/suppliers', 'Suppliers (Default)');

    console.log('\n✅ V3.0 Reports Smoke Passed!');
}

run().catch(e => {
    console.error('\n❌ FAILED:', e.message);
    process.exit(1);
});
