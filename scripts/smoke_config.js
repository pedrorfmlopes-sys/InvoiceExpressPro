const { getAuthHeaders } = require('./smoke_utils'); // Assuming getAuthHeaders returns headers including Token
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const PROJECT = 'default';

// Local Helpers
function check(condition, msg) {
    if (!condition) {
        throw new Error(`Check Failed: ${msg}`);
    }
    console.log(`[PASS] ${msg}`);
}

function checkStatus(res, code) {
    if (res.status !== code) {
        throw new Error(`Expected status ${code}, got ${res.status}. Body: ${JSON.stringify(res.data)}`);
    }
    console.log(`[PASS] Status ${code}`);
}

async function run() {
    console.log('--- SMOKE: CONFIG MODULE ---');
    try {
        // 1. Login Logic
        // smoke_utils exports getAuthHeaders which does login logic
        // But getAuthHeaders returns { Cookie, Authorization }
        const headers = await getAuthHeaders();
        // However, getAuthHeaders in smoke_utils.js uses internal logic.
        // If smoke_utils only has getAuthHeaders, we use it.

        console.log('Got Auth Headers.');

        console.log('1. GET /api/config/secrets (Default)');
        const getSecretsRes = await axios.get(`${BASE_URL}/api/config/secrets?project=${PROJECT}`, { headers, validateStatus: () => true });
        checkStatus(getSecretsRes, 200);
        check(getSecretsRes.data.hasApiKey !== undefined, 'Response has hasApiKey');

        console.log('2. POST /api/config/secrets');
        const postSecretsRes = await axios.post(`${BASE_URL}/api/config/secrets?project=${PROJECT}`, { apiKey: 'sk-test-key-123456789' }, { headers, validateStatus: () => true });
        checkStatus(postSecretsRes, 200);

        console.log('3. GET /api/config/secrets (Masked)');
        const getSecretsRes2 = await axios.get(`${BASE_URL}/api/config/secrets?project=${PROJECT}`, { headers, validateStatus: () => true });
        checkStatus(getSecretsRes2, 200);
        check(getSecretsRes2.data.hasApiKey === true, 'hasApiKey is true');

        const masked = getSecretsRes2.data.maskedKey;
        console.log('   Masked Key:', masked);
        // "sk-..." + "6789" (length 18+)
        check(masked.startsWith('sk-') && masked.endsWith('6789'), 'Key is correctly masked');

        console.log('4. GET /api/config/doctypes (Default)');
        const getDocsRes = await axios.get(`${BASE_URL}/api/config/doctypes?project=${PROJECT}`, { headers, validateStatus: () => true });
        checkStatus(getDocsRes, 200);
        check(getDocsRes.data.items && Array.isArray(getDocsRes.data.items), 'Returns items array');

        console.log('5. POST /api/config/doctypes');
        const newTypes = ['TypeA', 'TypeB'];
        const postDocsRes = await axios.post(`${BASE_URL}/api/config/doctypes?project=${PROJECT}`, { items: newTypes }, { headers, validateStatus: () => true });
        checkStatus(postDocsRes, 200);

        console.log('6. GET /api/config/doctypes (Updated)');
        const getDocsRes2 = await axios.get(`${BASE_URL}/api/config/doctypes?project=${PROJECT}`, { headers, validateStatus: () => true });
        checkStatus(getDocsRes2, 200);
        check(JSON.stringify(getDocsRes2.data.items) === JSON.stringify(newTypes), 'Items updated');

        console.log('--- SMOKE PASSED ---');
    } catch (e) {
        console.error('--- SMOKE FAILED ---');
        console.error(e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    }
}

run();
