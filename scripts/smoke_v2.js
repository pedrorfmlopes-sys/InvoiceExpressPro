const fs = require('fs');
const path = require('path');
const http = require('http');

// Fixed Args Parser
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
        const key = arg.slice(2);
        // If next arg is not a flag, take it as value
        const nextVal = argv[i + 1];
        if (nextVal && !nextVal.startsWith('--')) {
            args[key] = nextVal;
            i++; // skip next
        } else {
            args[key] = true;
        }
    }
}

const FILE_PATH = args.file;
const HOST = args.host || 'http://localhost:3000';
const TOKEN = args.token || process.env.AUTH_TOKEN;

if (!FILE_PATH) {
    console.error("Usage: node scripts/smoke_v2.js --file <path_to_pdf> [--host <url>] [--token <jwt>]");
    process.exit(1);
}

// Ensure existence validation
if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
}

console.log(`Testing V2 Extraction with: ${FILE_PATH}`);
const API_URL = `${HOST}/api/v2/extract`;
console.log(`Target: ${API_URL}`);

// Boundary for multipart
const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

const postDataHead = `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${path.basename(FILE_PATH)}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;

const postDataTail = `\r\n--${boundary}--\r\n`;

const fileStream = fs.readFileSync(FILE_PATH);

try {
    const url = new URL(API_URL);
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname || '/api/v2/extract',
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(postDataHead) + fileStream.length + Buffer.byteLength(postDataTail),
            'x-user-id': 'smoke-test-user', // Bypass auth or simulate context
            'x-project-id': 'default'
        }
    };

    if (TOKEN) {
        options.headers['Authorization'] = `Bearer ${TOKEN}`;
    }

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`\nStatus: ${res.statusCode}`);
            try {
                const json = JSON.parse(data);
                console.log("Response JSON:");
                console.dir(json, { depth: null, colors: true });

                // Write to tmp for debugging if needed (optional based on user req, but they said "ou guardar")
                // We keep it printed as requested.
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

} catch (err) {
    console.error("Invalid URL or Request Error:", err.message);
}
