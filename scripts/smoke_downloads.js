const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
const OUTPUT_FILE = 'docs/RUNTIME_EXPORT_REPORTS_SMOKE.md';
let output = '# Export & Reports Smoke Test Results\n\n';

async function log(msg) {
    console.log(msg);
    output += msg + '\n';
}

async function run() {
    try {
        log(`Run at: ${new Date().toISOString()}`);

        // 1. Login
        const email = 'admin@smoke.test';
        let token = null;

        try {
            // Ensure user exists (Bootstrap)
            try { await axios.post(`${BASE_URL}/api/auth/bootstrap`, { email, password: 'password123' }); } catch { }

            const res = await axios.post(`${BASE_URL}/api/auth/login`, { email, password: 'password123' });
            token = res.data.token;
            log('Login: OK');
        } catch (e) {
            log('Login failed: ' + e.message);
            if (process.env.AUTH_MODE === 'required') throw e;
        }

        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // 2. Test Export XLSX (POST)
        try {
            const res = await axios.post(`${BASE_URL}/api/export.xlsx?project=default`, {}, {
                headers,
                responseType: 'arraybuffer'
            });
            log(`Export XLSX: OK (Status: ${res.status}, Size: ${res.data.length} bytes)`);
        } catch (e) {
            log(`Export XLSX: FAILED (${e.response?.status} ${e.response?.statusText || e.message})`);
        }

        // 3. Test Suppliers Report (GET)
        try {
            const res = await axios.get(`${BASE_URL}/api/reports/suppliers?project=default`, { headers });
            log(`Report Suppliers: OK (Status: ${res.status}, Items: ${res.data.items?.length})`);
        } catch (e) {
            log(`Report Suppliers: FAILED (${e.response?.status} ${e.response?.statusText || e.message})`);
        }

        // 4. Test Pro PDF (POST)
        try {
            const res = await axios.post(`${BASE_URL}/api/reports/pro-pdf?project=default`, { reportType: 'Geral' }, { headers });
            log(`Report Pro PDF (Gen): OK (Status: ${res.status}, Msg: ${res.data.message || 'JSON OK'})`);
        } catch (e) {
            log(`Report Pro PDF: FAILED (${e.response?.status} ${e.response?.statusText || e.message})`);
        }

    } catch (e) {
        log('CRITICAL ERROR: ' + e.message);
    } finally {
        fs.writeFileSync(OUTPUT_FILE, output);
    }
}

run();
