const fs = require('fs');

// Set Env Vars for Testing BEFORE app import
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';
process.env.ALLOW_JSON_FALLBACK = 'true';

const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = require('../server/src/app');
const http = require('http');

const PORT = 3001;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_FILE = 'docs/RUNTIME_CORE_V2_FLOW.md';
let output = '# Core V2 Runtime Verification\n\n';

async function log(msg) {
    console.log(msg);
    output += msg + '\n\n';
}

async function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer(app);
        server.listen(PORT, () => resolve(server));
    });
}

async function run() {
    let server;
    try {
        log(`Run at: ${new Date().toISOString()}`);
        server = await startServer();
        log(`Test Server running on port ${PORT}`);

        // 1. Login
        const email = 'admin@smoke.test';
        try { await axios.post(`${BASE_URL}/api/auth/bootstrap`, { email, password: 'password123' }); } catch { }
        const res = await axios.post(`${BASE_URL}/api/auth/login`, { email, password: 'password123' });
        const token = res.data.token;
        const headers = { Authorization: `Bearer ${token}` };
        log('1. Login: OK');

        // 2. Upload
        const form = new FormData();
        let pdfPath = 'dummy.pdf';

        // Find a real PDF
        const candidates = [
            'uploads/1764781058768_1407-B.pdf',
            'data/projects/default/staging/1764961955234_FatturaEsteroEuro2.pdf',
            'data/projects/default/archive/2025/12/Fattura-000088_B.pdf'
        ];

        for (const c of candidates) {
            if (fs.existsSync(c)) {
                pdfPath = c;
                console.log('Using existing PDF:', c);
                break;
            }
        }

        if (pdfPath === 'dummy.pdf' && !fs.existsSync('dummy.pdf')) {
            // Fallback if no existing found (still try minimal if candidates fail)
            const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n223\n%%EOF';
            fs.writeFileSync('dummy.pdf', pdfContent);
        }

        form.append('files', fs.createReadStream(pdfPath));

        const upRes = await axios.post(`${BASE_URL}/api/v2/upload?project=default`, form, { headers: { ...headers, ...form.getHeaders() } });
        log(`2. Upload: OK (Docs: ${upRes.data.docs.length})`);
        const docId = upRes.data.docs[0].id;
        log(`   Doc ID: ${docId}`);

        // 3. Extract
        const exRes = await axios.post(`${BASE_URL}/api/v2/extract?project=default`, { docIds: [docId] }, { headers });
        log(`3. Extract: OK (Results: ${exRes.data.results.length})`);

        if (!exRes.data.results[0].ok) {
            throw new Error('Extraction failed for doc: ' + exRes.data.results[0].error);
        }

        const row = exRes.data.results[0].row;
        log(`   Method: ${row.extractionMethod}, Status: ${row.status}`);

        const uniqueNum = 'V2-' + Date.now();
        const patchRes = await axios.patch(`${BASE_URL}/api/v2/docs/${docId}?project=default`, {
            docType: 'Fatura V2',
            docNumber: uniqueNum,
            total: 500
        }, { headers });
        log(`4. Patch: OK (Type: ${patchRes.data.row.docType})`);

        // 5. Finalize
        const finRes = await axios.post(`${BASE_URL}/api/v2/docs/finalize?project=default`, {
            id: docId,
            docType: 'Fatura V2',
            docNumber: uniqueNum
        }, { headers });
        log(`5. Finalize: OK (Status: ${finRes.data.row.status})`);

        // 6. Export
        const expRes = await axios.post(`${BASE_URL}/api/v2/export.xlsx?project=default`, {}, {
            headers,
            responseType: 'arraybuffer'
        });
        log(`6. Export: OK (Size: ${expRes.data.length} bytes)`);

    } catch (e) {
        log('CRITICAL ERROR: ' + (e.response?.data?.error || e.message));
        if (e.response) log('Response data: ' + JSON.stringify(e.response.data));
    } finally {
        fs.writeFileSync(OUTPUT_FILE, output);
        // Clean up dummy
        if (fs.existsSync('dummy.pdf')) fs.unlinkSync('dummy.pdf');
        if (server) server.close();
        // Force exit for knex handles
        setTimeout(() => process.exit(0), 1000);
    }
}

run();
