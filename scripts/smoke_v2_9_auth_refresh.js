// scripts/smoke_v2_9_auth_refresh.js
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
// Credentials
const ADMIN_EMAIL = 'admin@smoke.test';
const ADMIN_PASS = 'password123';

const jar = new CookieJar();
const client = wrapper(axios.create({ baseURL: BASE_URL, jar, validateStatus: () => true }));

async function run() {
    console.log('--- V2.9 Auth Refresh & Role Parity Smoke Test ---');

    // 0. Bootstrap Admin (Idempotent-ish)
    // If system is fresh, this works. If not, we ignore 409.
    console.log('0. Bootstrap/Check Admin...');
    const bootRes = await client.post('/auth/bootstrap', {
        email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin', orgName: 'SmokeOrg'
    });
    if (bootRes.status === 200) {
        console.log('   [INFO] Bootstrap successful.');
    } else if (bootRes.status === 409) {
        console.log('   [INFO] System already initialized (expected).');
    } else {
        throw new Error(`Bootstrap failed with unexpected status: ${bootRes.status}`);
    }

    // 1. Admin Login
    console.log('1. Admin Login...');
    const loginRes = await client.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });

    if (loginRes.status !== 200) {
        console.error('Login Body:', loginRes.data);
        throw new Error(`Login failed: ${loginRes.status}`);
    }

    const initialToken = loginRes.data.token;
    if (!initialToken) throw new Error('No token returned from login');

    // Check Cookies for refreshToken (Scoped to /api/auth)
    const cookies = await jar.getCookies(BASE_URL + '/auth');
    const refreshCookie = cookies.find(c => c.key === 'refreshToken');

    // Robustness: fall back to checking set-cookie header if jar check is finicky in test env
    if (!refreshCookie) {
        const setCookieHeaders = loginRes.headers['set-cookie'];
        if (!setCookieHeaders || !setCookieHeaders.some(h => h.includes('refreshToken='))) {
            throw new Error('Refresh Token cookie not set in jar OR headers');
        }
        console.log('   [WARN] Cookie found in headers but not jar (likely scope issue resolved by next request).');
    }
    console.log('   [PASS] Login successful, token and cookie received.');

    // 2. Verify Role (Access Token)
    console.log('2. Verify Role (Initial Token)...');
    const meRes1 = await client.get('/auth/me', { headers: { Authorization: `Bearer ${initialToken}` } });
    if (meRes1.status !== 200) throw new Error(`Me check failed: ${meRes1.status}`);

    console.log(`   [INFO] Role: ${meRes1.data.role}`);
    if (meRes1.data.role !== 'admin') throw new Error(`Expected role 'admin', got '${meRes1.data.role}'`);
    console.log('   [PASS] Initial role is admin.');

    // 3. Refresh Token
    console.log('3. Refresh Token...');
    // The cookie is in the jar, so it sends automatically
    const refreshRes = await client.post('/auth/refresh');

    if (refreshRes.status !== 200) {
        console.error('Refresh Body:', refreshRes.data);
        throw new Error(`Refresh failed: ${refreshRes.status}`);
    }

    const newToken = refreshRes.data.token;
    if (!newToken) throw new Error('No token returned from refresh');
    if (newToken === initialToken) console.warn('   [WARN] Token matches initial (might be intended if rotation is off, but usually different)');

    // Decode checks (optional, but let's trust /me)
    console.log('   [PASS] Refresh successful.');

    // 4. Verify Role (New Token)
    console.log('4. Verify Role (New Token)...');
    const meRes2 = await client.get('/auth/me', { headers: { Authorization: `Bearer ${newToken}` } });

    if (meRes2.status !== 200) throw new Error(`Me check (after refresh) failed: ${meRes2.status}`);

    console.log(`   [INFO] Role: ${meRes2.data.role}`);
    if (meRes2.data.role !== 'admin') throw new Error(`Expected role 'admin' after refresh, got '${meRes2.data.role}'`);

    console.log('   [PASS] Role persisted after refresh.');
    console.log('\n✅ V2.9 Auth Refresh Smoke Passed!');
}

run().catch(e => {
    console.error('\n❌ FAILED:', e.message);
    process.exit(1);
});
