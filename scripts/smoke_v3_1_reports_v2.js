// scripts/smoke_v3_1_reports_v2.js
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const ADMIN_EMAIL = 'admin@smoke.test';
const ADMIN_PASS = 'password123';

const jar = new CookieJar();
const client = wrapper(axios.create({ baseURL: BASE_URL, jar, validateStatus: () => true }));

async function run() {
    console.log('--- V3.1 Reports V2 (Modular) Smoke Test ---');

    // 1. Login
    console.log('1. Login Admin...');
    const loginRes = await client.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (loginRes.status !== 200) throw new Error('Login failed');
    const token = loginRes.data.token;
    console.log('   [PASS] Login OK. Token obtained.');

    // Fix: Valid headers structure
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    const checkEndpoint = async (url, name) => {
        console.log(`Checking ${name} (${url})...`);
        const res = await client.get(url, authHeaders);

        // Strict Validation: No 403 allowed
        if (res.status !== 200) {
            throw new Error(`Failed ${name}: ${res.status} ${JSON.stringify(res.data)}`);
        }

        // Contract Check
        const { meta, filters, rows } = res.data;
        if (!meta || !filters || !Array.isArray(rows)) {
            throw new Error(`Invalid Contract: Missing meta/filters/rows`);
        }
        console.log(`   [PASS] ${name} OK. Rows: ${rows.length}`);
    };

    // 3. Test Endpoints (Full Coverage)
    await checkEndpoint('/v2/reports/summary', 'Summary');
    await checkEndpoint('/v2/reports/top-suppliers?topN=5', 'Top Suppliers');
    await checkEndpoint('/v2/reports/top-customers?topN=5', 'Top Customers'); // New
    await checkEndpoint('/v2/reports/monthly-totals', 'Monthly');

    // 4. Test Export CSV
    // 4. Test Export CSV (Strict)
    console.log('Checking Export CSV...');
    const csv = await client.get('/v2/reports/export?format=csv', {
        headers: authHeaders.headers
    });

    if (csv.status !== 200) throw new Error(`CSV Export Failed: ${csv.status}`);
    const csvType = csv.headers['content-type'] || csv.headers['Content-Type'];
    if (!csvType.includes('text/csv')) throw new Error(`Invalid CSV Content-Type: ${csvType}`);
    if (csv.data.length < 50) throw new Error('CSV body too small');
    if (!csv.data.includes('docType') && !csv.data.includes('docNumber')) throw new Error('CSV missing headers');
    console.log(`   [PASS] Export CSV OK (${csv.data.length} chars)`);

    // Export XLSX (Strict)
    console.log('Checking Export XLSX...');
    const xlsx = await client.get('/v2/reports/export?format=xlsx', {
        headers: authHeaders.headers,
        responseType: 'arraybuffer'
    });
    if (xlsx.status !== 200) throw new Error(`XLSX Export Failed: ${xlsx.status}`);
    if (xlsx.data.length < 200) throw new Error('XLSX body too small (<200 bytes)');
    console.log(`   [PASS] Export XLSX OK (${xlsx.data.length} bytes)`);

    // 5. Test PDF Basic (Fix Header)
    console.log('Checking PDF Basic...');
    const pdf = await client.post('/v2/reports/pdf', {}, {
        headers: authHeaders.headers, // Fixed
        responseType: 'arraybuffer'
    });

    if (pdf.status !== 200) throw new Error(`PDF Basic Failed: ${pdf.status}`);
    if (pdf.data.length < 100) throw new Error('PDF too small');
    const contentType = pdf.headers['content-type'] || pdf.headers['Content-Type'];
    if (!contentType.includes('pdf')) throw new Error(`Invalid Content-Type: ${contentType}`);
    console.log('   [PASS] PDF Generated');

    // 6. PDF Pro (Optional/501)
    console.log('Checking PDF Pro (Stub)...');
    const pdfPro = await client.post('/v2/reports/pdf-pro', {}, {
        headers: authHeaders.headers
    });
    if (pdfPro.status === 501) {
        console.log('   [PASS] PDF Pro returned 501 (Not Configured) as expected');
    } else {
        throw new Error(`PDF Pro should be 501, got ${pdfPro.status}`);
    }

    console.log('\n✅ V3.1 Reports V2 Smoke Passed!');
}

run().catch(e => {
    console.error('\n❌ FAILED:', e.message);
    process.exit(1);
});
