const axios = require('axios');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
console.log(`[Smoke] Target: ${BASE_URL}`);

const RESULTS = [];

async function test(name, method, path, body = null, expectedCode = 200, opts = {}) {
    try {
        const url = `${BASE_URL}${path}`;
        let res;
        const conf = { validateStatus: () => true, ...opts }; // Start with empty options or provided stats

        // Handle methods
        if (method === 'GET') res = await axios.get(url, conf);
        else if (method === 'POST') res = await axios.post(url, body, conf);
        else if (method === 'PUT') res = await axios.put(url, body, conf);
        else if (method === 'PATCH') res = await axios.patch(url, body, conf);
        else if (method === 'DELETE') res = await axios.delete(url, conf);

        const ok = res.status === expectedCode;
        const statusStr = ok ? 'PASS' : 'FAIL';
        console.log(`[${statusStr}] ${method} ${path} -> ${res.status} (Exp: ${expectedCode})`);

        RESULTS.push({ name, method, path, status: res.status, expected: expectedCode, pass: ok, data: ok ? 'OK' : JSON.stringify(res.data).substring(0, 100) });
        return res; // return full response for chaining if needed (e.g. get id)
    } catch (e) {
        console.log(`[ERR ] ${method} ${path} -> ${e.message}`);
        RESULTS.push({ name, method, path, status: 'ERR', expected: expectedCode, pass: false, data: e.message });
    }
}

async function run() {
    // 1. Health
    await test('Health', 'GET', '/api/health');

    // 2. Config Secrets
    await test('Get Secrets', 'GET', '/api/config/secrets?project=smoke');
    await test('Set Secrets', 'POST', '/api/config/secrets?project=smoke', { apiKey: 'sk-smoke-test' });

    // 3. Dirs (Check if API exists)
    await test('List Dirs', 'GET', '/api/dirs?project=smoke');

    // 4. Doc Types
    await test('Get DocTypes', 'GET', '/api/config/doctypes?project=smoke');
    // FAIL expected if MISSING
    await test('Set DocTypes', 'PUT', '/api/config/doctypes?project=smoke', { items: ['TestType'] }, 200);

    // 5. Upload/Extract Flow (requires file mocked?)
    // Skipping complex upload, testing endpoint existence
    // POST /api/extract expects FormData usually. Sending empty might give 400 or 500, but checking 404 is main goal.
    // If it returns 404, it's missing. If 400/500, it's there.
    await test('Extract (Probe)', 'POST', '/api/extract?project=smoke', {}, 400); // Expect 400 bad request, not 404

    // 6. Reports (Probe)
    await test('Report PDF (Probe)', 'POST', '/api/reports/pro-pdf?project=smoke', {}, 200); // It was POST in dump
    await test('Report PDF GET (Probe)', 'GET', '/api/reports/pro-pdf?project=smoke', null, 404); // Expect 404 per mis-match report?

    // 7. Transactions
    await test('List Transactions', 'GET', '/api/transactions?project=smoke');

    // 8. Normalization
    await test('Normalize GET', 'GET', '/api/normalize?project=smoke');
    await test('Normalize POST', 'POST', '/api/normalize?project=smoke', { type: 'vendor', alias: 'foo', canonical: 'bar' }, 200);

    // 9. Missing endpoints probe
    await test('Mkdir (Probe)', 'POST', '/api/mkdir?project=smoke', { dir: 'test' }, 200);
    await test('Set Output (Probe)', 'POST', '/api/set-output?project=smoke', { dir: 'test' }, 200);


    // Output Report
    const lines = [
        '# Runtime Integration Smoke Test',
        `Date: ${new Date().toISOString()}`,
        'BaseURL: ' + BASE_URL,
        '',
        '| Name | Method | Path | Status | Expected | Pass | Msg |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...RESULTS.map(r => `| ${r.name} | ${r.method} | ${r.path} | ${r.status} | ${r.expected} | ${r.pass ? '✅' : '❌'} | ${r.data} |`)
    ];

    fs.writeFileSync('docs/RUNTIME_INTEGRATION_SMOKE.md', lines.join('\n'));
    console.log('Report saved to docs/RUNTIME_INTEGRATION_SMOKE.md');
}

run();
