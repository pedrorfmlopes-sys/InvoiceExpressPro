
// Test Script for Smart Lookup
// Usage: node verify_lookup.js <query>
// Example: node verify_lookup.js 508953596 (Stoneceramic NIF)

const http = require('http');

const query = process.argv[2] || '508953596'; // Default to Stoneceramic NIF

function lookup(q) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: `/api/crm/lookup?q=${encodeURIComponent(q)}`,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    console.log(`Status: ${res.statusCode}`);
                    const json = JSON.parse(body);
                    console.log('Result:', JSON.stringify(json, null, 2));
                    resolve();
                } catch (e) {
                    console.error('Failed to parse:', body);
                    reject(e);
                }
            });
        });

        req.on('error', e => reject(e));
        req.end();
    });
}

async function test() {
    console.log('--- Testing VIES (Known Valid) ---');
    await lookup('513501628'); // Google Portugal

    console.log('\n--- Testing Nominatim (Name) ---');
    await lookup('Stoneceramic');

    console.log('\n--- Testing Original NIF ---');
    await lookup('508953596');
}

test();
