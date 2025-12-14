const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
// We will test assuming server is already running in correct mode.
// We can detect mode by checking /health or response to unauthed request?
// Actually, let's just try scenarios and log results.

let AUTH_TOKEN = null;

const SCENARIOS = [
    { name: 'Health', method: 'GET', url: '/api/health', expect: [200] },

    // Auth Flow (Try to get token)
    {
        name: 'Bootstrap/Login',
        method: 'POST',
        url: '/api/auth/login',
        data: { email: 'admin@smoke.test', password: 'password123' },
        expect: [200, 401, 403], // 401 if wrong creds, 200 ok
        saveToken: true
    },

    // Protected Endpoint (No Token)
    {
        name: 'Protected No Token (Excel)',
        method: 'GET',
        url: '/api/excel.json?project=default',
        expect: [200, 401] // 200 if optional, 401 if required
    },

    // Protected Endpoint (With Token)
    {
        name: 'Protected With Token (Excel)',
        method: 'GET',
        url: '/api/excel.json?project=default',
        auth: true,
        expect: [200]
    },

    // Entitlement Check (No Token) -> Should be 200 in optional, 401/403 in required
    {
        name: 'Entitlement No Token (Pro PDF)',
        method: 'POST',
        url: '/api/reports/pro-pdf?project=default',
        expect: [200, 401]
    },

    // Entitlement Check (With Token)
    // If admin has pro plan (seed), should be 200. If normal plan, 403.
    {
        name: 'Entitlement With Token (Pro PDF)',
        method: 'POST',
        url: '/api/reports/pro-pdf?project=default',
        auth: true,
        expect: [200, 403]
    }
];

async function run() {
    let output = '';
    console.log('--- SMOKE TEST PHASE 3.1 ---');

    // Pre-flight: Try Bootstrap if Login fails? 
    // For simplicity, we assume DB persisted from Phase 3.

    for (const s of SCENARIOS) {
        if (s.auth && !AUTH_TOKEN) {
            output += `SKIPPED ${s.name} (No Token)\n`;
            continue;
        }

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
            const status = res.status;

            if (s.saveToken && res.data.token) {
                AUTH_TOKEN = res.data.token;
                console.log('Token acquired.');
            }

            // Heuristic explanation
            let result = `[${status}]`;
            if (status === 200) result += ' OK';
            if (status === 401) result += ' Unauthorized (Expected in Required)';
            if (status === 403) result += ' Forbidden (Entitlement/Role)';

            const log = `${s.name}: ${s.method} ${s.url} -> ${result}`;
            output += log + '\n';
            console.log(log);

        } catch (e) {
            output += `${s.name}: ERROR ${e.message}\n`;
            console.log(`${s.name}: ERROR`);
        }
    }

    // Append to runtime file (don't overwrite if we run multiple times? actually overwriting is cleaner for final artifact)
    // User requested update RUNTIME_ENDPOINT_SMOKE.txt
    // We should probably accumulate results if we run 2 modes?
    fs.appendFileSync('RUNTIME_ENDPOINT_SMOKE.txt', `\n--- RUN AT ${new Date().toISOString()} ---\n` + output);
}

run();
