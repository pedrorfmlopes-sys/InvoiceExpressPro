const axios = require('axios');
const fs = require('fs');

async function run() {
    console.log('--- Smoke Test: Exports V2.8 ---');
    try {
        const client = axios.create({
            baseURL: 'http://localhost:3000/api',
            validateStatus: () => true
        });

        // 1. Bootstrap Admin (Standard)
        // If 401, maybe existing admin has diff pass. Let's try to create a fresh user via QA endpoint if possible? 
        // No, QA endpoint needs specific ENV mode.
        // Let's rely on standard bootstrap with a unique email to guarantee we get a fresh user.

        const email = `test_export_${Date.now()}@t.com`;
        const pass = '123456';

        process.stdout.write('1. Seeding User (QA Mode)... ');
        // We assume QA_MODE=true is set in env
        const seed = await client.post('/auth/qa/seed-user', { email, password: pass, name: 'Tester', orgId: 'default' });
        if (seed.status !== 200) console.warn('Seed status:', seed.status); // Might be 200 {userId...}

        const login = await client.post('/auth/login', { email, password: pass });
        const token = login.data.token;
        console.log('OK');

        if (!token) {
            console.error('Login Failed Response:', login.status, login.data);
            throw new Error('Login failed');
        }

        // 2. Export V1
        process.stdout.write('2. Export V1 (Stream)... ');
        const v1 = await client.post('/export.xlsx?project=default', {}, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'stream'
        });
        if (v1.status !== 200) throw new Error(`V1 Status ${v1.status}`);

        let v1Bytes = 0;
        v1.data.on('data', c => v1Bytes += c.length);
        await new Promise((resolve) => v1.data.on('end', resolve));

        if (v1Bytes < 100) throw new Error(`V1 Size too small: ${v1Bytes}`);
        console.log(`OK (${v1Bytes} bytes)`);

        // 3. Export V2
        process.stdout.write('3. Export V2 (Stream)... ');
        const v2 = await client.post('/v2/export.xlsx?project=default', {}, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'stream'
        });
        if (v2.status !== 200) throw new Error(`V2 Status ${v2.status}`);

        let v2Bytes = 0;
        v2.data.on('data', c => v2Bytes += c.length);
        await new Promise((resolve) => v2.data.on('end', resolve));

        if (v2Bytes < 100) throw new Error(`V2 Size too small: ${v2Bytes}`);
        console.log(`OK (${v2Bytes} bytes)`);

        console.log('[PASS] Exports streaming works.');

    } catch (e) {
        console.error('\n[FAIL]', e.message);
        process.exit(1);
    }
}

run();
