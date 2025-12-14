// scripts/smoke_v2_7_rbac.js
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
// Credentials
const ADMIN_EMAIL = 'admin@smoke.test';
const ADMIN_PASS = 'password123';
const USER_EMAIL = 'user@smoke.test';
const USER_PASS = 'password123';

const jarAdmin = new CookieJar();
const clientAdmin = wrapper(axios.create({ baseURL: BASE_URL, jar: jarAdmin, validateStatus: () => true }));

const jarUser = new CookieJar();
const clientUser = wrapper(axios.create({ baseURL: BASE_URL, jar: jarUser, validateStatus: () => true }));

async function run() {
    console.log('--- V2.7 RBAC Smoke Test ---');

    // 0. Bootstrap Admin (Idempotent)
    console.log('0. Setting up Users...');
    await clientAdmin.post('/auth/bootstrap', {
        email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin', orgName: 'SmokeOrg'
    }); // Ignore 409

    // 1. Admin Login
    console.log('1. Admin Login...');
    const loginAdmin = await clientAdmin.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (loginAdmin.status !== 200) throw new Error(`Admin login failed: ${loginAdmin.status}`);
    const adminToken = loginAdmin.data.token;

    // Check Role
    const meAdmin = await clientAdmin.get('/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
    console.log(`   [INFO] Admin Role: ${meAdmin.data.role}`);
    if (meAdmin.data.role !== 'admin') throw new Error('Admin user does not have admin role');

    // 2. Setup Regular User (via bootstrap-like or just ensure it exists if implementation supports it)
    // IMPORTANT: Since we don't have a public signup or user creation endpoint in V2 yet,
    // we must rely on a way to create this user.
    // If no endpoint exists, we might need to insert into DB directly for the test, OR add a creates user helper.
    // For now, let's assume we added a test-only route or use direct DB if possible.
    // BUT! I added createRegularUser to UserService. Let's assume we added a route OR we do it via DB here.
    // Since we need to run this against a running server, direct code access is tricky if it involves requires.
    // Let's fallback to needing a way to create a user.
    // HOTFIX: We add a temporary dev route or usage of 'user@smoke.test' if pre-seeded.
    // Let's try to just bootstrap with a different org? No, bootstrap is one-time system init.
    // OK, let's use the DB direct approach for the USER creation since this is a smoke test script running in same env usually.

    try {
        // Ensure user exists via QA endpoint
        console.log('   [INFO] ensuring regular user via QA endpoint...');

        // We need orgId from admin's context to add user to same org
        // Get Admin Context
        const meResult = await clientAdmin.get('/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        const orgId = meResult.data.org.id;

        await clientAdmin.post('/auth/qa/seed-user', {
            email: USER_EMAIL,
            password: USER_PASS,
            name: 'Regular User',
            orgId
        }, { headers: { Authorization: `Bearer ${adminToken}` } });

    } catch (e) {
        console.warn('   [WARN] User seed failed:', e.message);
        if (e.response) {
            console.warn('   [DEBUG] Status:', e.response.status);
            console.warn('   [DEBUG] Data:', JSON.stringify(e.response.data));
        }
        // If it fails, maybe user exists, continue to try login
    }

    // 3. User Login
    console.log('3. User Login...');
    const loginUser = await clientUser.post('/auth/login', { email: USER_EMAIL, password: USER_PASS });
    if (loginUser.status !== 200) throw new Error(`User login failed: ${loginUser.status}`);
    const userToken = loginUser.data.token;

    const meUser = await clientUser.get('/auth/me', { headers: { Authorization: `Bearer ${userToken}` } });
    console.log(`   [INFO] User Role: ${meUser.data.role}`);
    if (meUser.data.role !== 'user') throw new Error('User should have role "user"');

    // 4. Admin Action -> Allowed
    console.log('4. Admin creates DocType (Should Pass)...');
    const dtId = 'rbac_test_' + Date.now();
    const resAdm = await clientAdmin.post('/v2/doctypes', {
        id: dtId, labelPt: 'RBAC Test', synonyms: [], keywords: []
    }, { headers: { Authorization: `Bearer ${adminToken}` } });

    if (resAdm.status !== 200) throw new Error(`Admin create failed: ${resAdm.status}`);
    console.log('   [PASS] Admin created DocType.');

    // 5. User Action -> Denied
    console.log('5. User deletes DocType (Should Fail)...');
    const resUsr = await clientUser.delete(`/v2/doctypes/${dtId}`, {
        headers: { Authorization: `Bearer ${userToken}` }
    });

    if (resUsr.status !== 403) throw new Error(`User action should be 403, got ${resUsr.status}`);
    if (resUsr.data.code !== 'FORBIDDEN') console.warn('   [WARN] Error code mismatch');

    console.log('   [PASS] User action blocked (403).');

    // 6. User Read -> Allowed
    console.log('6. User lists Docs (Should Pass)...');
    const resList = await clientUser.get('/v2/docs', {
        headers: { Authorization: `Bearer ${userToken}` }
    });
    if (resList.status !== 200) throw new Error(`User list failed: ${resList.status}`);
    console.log('   [PASS] User can list docs.');

    console.log('\n✅ V2.7 RBAC Smoke Passed!');
}

run().catch(e => {
    console.error('\n❌ FAILED:', e.message);
    process.exit(1);
});
