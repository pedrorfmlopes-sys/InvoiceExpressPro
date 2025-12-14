const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
let AUTH_TOKEN = null;

const SCENARIOS = [
    // 1. Legacy Check (Optional Mode)
    { method: 'GET', url: '/api/health', expect: 200 },
    { method: 'GET', url: '/api/excel.json?project=default', expect: 200 },

    // 2. Auth Flow
    // Bootstrap (Might fail 409 if already done, which is fine, we handle it)
    {
        method: 'POST',
        url: '/api/auth/bootstrap',
        data: { email: 'admin@smoke.test', password: 'password123', name: 'Smoke Admin' },
        expect: [200, 409],
        saveToken: true
    },
    // Login (If bootstrap was 409, we likely need to login)
    {
        method: 'POST',
        url: '/api/auth/login',
        data: { email: 'admin@smoke.test', password: 'password123' },
        expect: 200,
        saveToken: true
    },
    // Me (Protected)
    { method: 'GET', url: '/api/auth/me', expect: 200, auth: true }
];

async function run() {
    let output = '';
    const results = [];

    console.log('--- STARTING SMOKE TEST ---');

    for (const s of SCENARIOS) {
        const fullUrl = BASE_URL + s.url;
        try {
            const config = {
                method: s.method,
                url: fullUrl,
                validateStatus: () => true
            };
            if (s.data) config.data = s.data;
            if (s.auth && AUTH_TOKEN) config.headers = { 'Authorization': `Bearer ${AUTH_TOKEN}` };

            const res = await axios(config);
            const passed = Array.isArray(s.expect) ? s.expect.includes(res.status) : res.status === s.expect;

            if (s.saveToken && res.data.token) {
                AUTH_TOKEN = res.data.token;
                console.log('Token acquired.');
            }

            const bodyPreview = JSON.stringify(res.data).substring(0, 100);

            output += `${s.method} ${s.url} -> ${res.status} ${passed ? 'OK' : 'FAIL'}\nBody: ${bodyPreview}\n\n`;
            console.log(`${s.method} ${s.url} -> ${res.status}`);

        } catch (e) {
            output += `${s.method} ${fullUrl} -> ERROR: ${e.message}\n\n`;
            console.log(`${s.method} ${s.url} -> ERROR`);
        }
    }

    fs.writeFileSync('RUNTIME_ENDPOINT_SMOKE.txt', output.trim());
    console.log('--- DONE ---');
}

run();
