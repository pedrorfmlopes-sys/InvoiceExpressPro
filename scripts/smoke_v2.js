const fs = require('fs');
const path = require('path');
const http = require('http');

// Simple args parser
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, val] = arg.split('=');
    if (key.startsWith('--')) acc[key.slice(2)] = val || true;
    return acc;
}, {});

const FILE_PATH = args.file;
const HOST = args.host || 'http://localhost:3000';
const API_URL = `${HOST}/api/v2/extract`;

if (!FILE_PATH) {
    console.error("Usage: node scripts/smoke_v2.js --file <path_to_pdf> [--host <url>]");
    process.exit(1);
}

if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
}

console.log(`Testing V2 Extraction with: ${FILE_PATH}`);
console.log(`Target: ${API_URL}`);

// Boundary for multipart
const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

const postDataHead = `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${path.basename(FILE_PATH)}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;

const postDataTail = `\r\n--${boundary}--\r\n`;

const fileStream = fs.readFileSync(FILE_PATH);

const options = {
    hostname: new URL(HOST).hostname,
    port: new URL(HOST).port,
    path: '/api/v2/extract',
    method: 'POST',
    headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(postDataHead) + fileStream.length + Buffer.byteLength(postDataTail),
        'x-user-id': 'smoke-test-user', // Bypass auth or simulate context
        'x-project-id': 'default'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(`\nStatus: ${res.statusCode}`);
        try {
            const json = JSON.parse(data);
            console.log("Response:");
            console.dir(json, { depth: null, colors: true });

            // Basic Assertions
            if (json.results && json.results[0]) {
                const res = json.results[0];
                if (res.status === 'success') {
                    console.log("\n✅ SUCCESS: Document extracted");
                    console.log(`   Type: ${res.normalized.docType}`);
                    console.log(`   Number: ${res.normalized.docNumber}`);
                    console.log(`   Total: ${res.normalized.totals.gross || res.normalized.totals.net}`);
                    console.log(`   Confidence: ${res.normalized.confidence}`);
                    if (res.normalized.needsReview) {
                        console.warn(`   ⚠️ Needs Review: ${res.normalized.reviewReason}`);
                    }
                } else {
                    console.error("\n❌ FAILED: Extraction returned error status");
                }
            }
        } catch (e) {
            console.log("Raw Response:", data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(postDataHead);
req.write(fileStream);
req.write(postDataTail);
req.end();
