// scripts/ping_suite.js
const http = require('http');

const ENDPOINTS = [
    { name: 'Health', path: '/api/health', method: 'GET', expect: 200 },
    { name: 'Excel Json', path: '/api/excel.json', method: 'GET', expect: 200 },
    { name: 'Extract (Mock)', path: '/api/extract', method: 'GET', expect: 404 }, // Should be POST
    { name: 'Reports Monthly', path: '/api/reports/monthly', method: 'GET', expect: 200 }, // Likely Missing -> 404
    { name: 'Audit', path: '/api/audit', method: 'GET', expect: 200 }, // Likely Missing -> 404
];

async function ping() {
    console.log('--- PING SUITE ---');
    for (const ep of ENDPOINTS) {
        await new Promise(resolve => {
            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: ep.path,
                method: ep.method
            }, (res) => {
                console.log(`${ep.name} [${ep.method} ${ep.path}]: ${res.statusCode} (Expected: ${ep.expect})`);
                resolve();
            });
            req.on('error', (e) => {
                console.log(`${ep.name}: ERROR (${e.message})`);
                resolve();
            });
            req.end();
        });
    }
}

ping();
