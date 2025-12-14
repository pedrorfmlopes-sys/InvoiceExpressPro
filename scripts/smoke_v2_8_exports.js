const axios = require('axios');
const fs = require('fs');

async function run() {
    console.log('--- Smoke Test: Exports V2.8 ---');
    try {
        const client = axios.create({
            baseURL: 'http://localhost:3000/api',
            validateStatus: () => true
        });

        // 1. Auth Setup (Standard Admin -> Seed User)
        const ADMIN_EMAIL = 'admin@smoke.test';
        const ADMIN_PASS = 'password123';
        const USER_EMAIL = 'user@smoke.test';
        const USER_PASS = 'password123';

        process.stdout.write('1. Bootstrapping Admin... ');
        // Idempotent bootstrap
        const boot = await client.post('/auth/bootstrap', {
            email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin', orgName: 'SmokeOrg'
        });
        if (boot.status !== 200 && boot.status !== 409) throw new Error(`Bootstrap failed: ${boot.status}`);

        // Admin Login
        const loginAdm = await client.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
        if (loginAdm.status !== 200) throw new Error('Admin login failed');
        const adminToken = loginAdm.data.token;

        // Get Org ID
        const meAdm = await client.get('/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        const orgId = meAdm.data.org.id;

        // Seed Regular User
        process.stdout.write('Seeding User... ');
        const seed = await client.post('/auth/qa/seed-user', {
            email: USER_EMAIL, password: USER_PASS, name: 'Smoke User', orgId
        }, { headers: { Authorization: `Bearer ${adminToken}` } });

        if (seed.status !== 200) {
            console.error('Seed Failed:', seed.status, seed.data);
            throw new Error('User seed failed');
        }

        // 2. User Login
        process.stdout.write('User Login... ');
        const login = await client.post('/auth/login', { email: USER_EMAIL, password: USER_PASS });
        const token = login.data.token;
        console.log('OK');

        if (!token) throw new Error('User login failed (no token)');

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
        if (v2.status !== 200) {
            const preview = await readStreamPreview(v2.data);
            console.error('[FAIL] V2 Status', v2.status, 'Body preview:', preview);
            throw new Error(`V2 Status ${v2.status}`);
        }

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

async function readStreamPreview(stream, maxBytes = 4096) {
    return new Promise((resolve) => {
        let size = 0;
        const chunks = [];
        stream.on('data', (c) => {
            if (size < maxBytes) {
                chunks.push(c);
                size += c.length;
            }
            if (size >= maxBytes) stream.destroy();
        });
        stream.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

run();
