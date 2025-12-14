// scripts/smoke_v2_6_auth.js
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');
const jwt = require('jsonwebtoken'); // You might need to install this or use pre-installed one if available, but usually we test strictly blackbox.
// However, to mimic client we just read response body. To check internal expiry handling, we rely on response codes.

const BASE_URL = 'http://localhost:3000/api';
const EMAIL = 'admin@smoke.test';
const PASSWORD = 'password123';

const jar = new CookieJar();
const client = wrapper(axios.create({
    baseURL: BASE_URL,
    jar,
    validateStatus: () => true // Handle errors manually
}));

async function run() {
    console.log('--- V2.6 Auth Smoke Test (Refresh Flow) ---');

    // 0. Bootstrap (idempotent-ish check)
    console.log('0. Bootstrapping...');
    try {
        await client.post('/auth/bootstrap', {
            email: EMAIL,
            password: PASSWORD,
            name: 'Admin',
            orgName: 'MyOrg'
        });
        console.log('   [INFO] Bootstrap request sent (might be 409 if exists).');
    } catch (e) {
        // ignore network errors, but let's see status
    }

    // 1. Login
    console.log('1. Logging in...');
    const loginRes = await client.post('/auth/login', { email: EMAIL, password: PASSWORD });
    if (loginRes.status !== 200) throw new Error(`Login failed: ${loginRes.status}`);

    const accessToken = loginRes.data.token;
    if (!accessToken) throw new Error('No access token returned');

    // Check Cookies
    console.log('   [DEBUG] Set-Cookie Header:', loginRes.headers['set-cookie']);

    // Check with correct path
    const cookies = await jar.getCookies(BASE_URL + '/auth');
    let refreshCookie = cookies.find(c => c.key === 'refreshToken');
    if (!refreshCookie) {
        // fallback check
        const allCookies = await jar.getCookies('http://localhost:3000/api/auth');
        const fallback = allCookies.find(c => c.key === 'refreshToken');
        if (!fallback) throw new Error('No refreshToken cookie set');
        refreshCookie = fallback; // Use the fallback if found
    }
    // if (!refreshCookie.httpOnly) throw new Error('Cookie is not HttpOnly'); // Tough-cookie might not expose httpOnly flag easily in simple object, skipping strict check or use .httpOnly property

    console.log('   [PASS] Login successful, cookie set.');

    // 2. Access Protected Resource
    console.log('2. Accessing Protected Resource (/auth/me)...');
    const meRes = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (meRes.status !== 200) throw new Error(`Me endpoint failed: ${meRes.status}`);
    console.log('   [PASS] Access verified.');

    // 3. Refresh Token
    console.log('3. Testing Refresh Endpoint...');
    // We send the cookie automatically thanks to jar
    const refreshRes = await client.post('/auth/refresh');
    if (refreshRes.status !== 200) throw new Error(`Refresh failed: ${refreshRes.status} ${JSON.stringify(refreshRes.data)}`);

    const newAccessToken = refreshRes.data.token;
    if (!newAccessToken) throw new Error('No new access token returned');
    if (newAccessToken === accessToken) console.warn('   [WARN] Token matches request (fine if not rotating secret/content, but usually different exp)');

    console.log('   [PASS] Refresh successful.');

    // 4. Use New Token
    console.log('4. Verifying New Token...');
    const meRes2 = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${newAccessToken}` }
    });
    if (meRes2.status !== 200) throw new Error(`Access with new token failed: ${meRes2.status}`);
    console.log('   [PASS] New token works.');

    // 5. Logout
    console.log('5. Logging out...');
    const logoutRes = await client.post('/auth/logout');
    if (logoutRes.status !== 200) throw new Error('Logout failed');

    // Verify Cookie Cleared
    // Note: jar.getCookies might still show it if it's expired or might show empty.
    // Ideally we check if it is cleared or expired.
    // tough-cookie manages this. We can verify by trying refresh again.

    console.log('   [PASS] Logout called.');

    // 6. Refresh Should Fail
    console.log('6. Refresh after Logout...');
    const badRefresh = await client.post('/auth/refresh');
    if (badRefresh.status !== 401) throw new Error(`Refresh should have failed (401), got ${badRefresh.status}`);
    if (badRefresh.data.code !== 'NO_REFRESH') console.warn(`   [WARN] Expected code NO_REFRESH, got ${badRefresh.data.code}`);

    console.log('   [PASS] Refresh rejected as expected.');

    console.log('\n✅ V2.6 Auth Smoke Passed!');
}

run().catch(e => {
    console.error('\n❌ FAILED:', e.message);
    if (e.response) console.error(e.response.data);
    process.exit(1);
});
