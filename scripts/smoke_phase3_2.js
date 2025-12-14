const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
const STATE_FILE = 'smoke_state.json';
const OUTPUT_FILE = 'RUNTIME_ENDPOINT_SMOKE.txt';

async function run() {
    const step = process.argv[2]; // --step1 or --step2

    if (step === '--step1') {
        console.log('--- DB PERSISTENCE TEST: STEP 1 (Patch) ---');
        try {
            // 1. Login
            const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
                email: 'admin@smoke.test', password: 'password123'
            });
            const token = loginRes.data.token;

            // 2. Get a Doc (from excel.json)
            const listRes = await axios.get(`${BASE_URL}/api/excel.json?project=default`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const rows = listRes.data.rows;
            if (!rows || rows.length === 0) throw new Error('No docs found to test');

            const targetDoc = rows[0];
            const newCustomer = `Customer_Updates_${Date.now()}`;

            console.log(`Target Doc: ${targetDoc.id}`);
            console.log(`Old Customer: ${targetDoc.customer}`);
            console.log(`New Customer: ${newCustomer}`);

            // 3. Patch Doc (Assuming we have a PATCH endpoint or using update mechanism?)
            // Phase 2/3 didn't explicitly mention PATCH endpoint. 
            // Phase 1 had `POST /api/doc/update` or similar? 
            // Checking `docRoutes.js`...
            // If no PATCH, we might use PUT or POST update.
            // Let's assume we need to verify if update endpoint exists.
            // If not, we cannot test persistence of *changes*, only read.
            // User Prompt: "PATCH num doc (ex.: mudar customer)" -> Implies endpoint exists.
            // I'll assume `PATCH /api/documents/:id` or similar.
            // Wait, I should verify `docRoutes.js`. 
            // If it doesn't exist, I might need to implement it or use what's available.
            // `projectRoutes` had `createProject`, `deleteProject`.
            // `docRoutes`... I'll check it before running.

            await axios.patch(`${BASE_URL}/api/doc/${targetDoc.id}?project=default`, {
                customer: newCustomer
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // 4. Verify Update immediately
            const verifyRes = await axios.get(`${BASE_URL}/api/excel.json?project=default`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const updated = verifyRes.data.rows.find(r => r.id === targetDoc.id);

            if (updated.customer !== newCustomer) {
                throw new Error(`Update failed! Expected ${newCustomer}, got ${updated.customer}`);
            }
            console.log('Step 1: Update confirmed in memory/DB.');

            // Save state
            fs.writeFileSync(STATE_FILE, JSON.stringify({
                id: targetDoc.id,
                expected: newCustomer,
                token // Reuse token if valid, or login again in step 2
            }));

            fs.writeFileSync(OUTPUT_FILE, `Step 1: Patch success. Customer -> ${newCustomer}\n`);

        } catch (e) {
            console.error('Step 1 Failed:', e.message);
            fs.writeFileSync(OUTPUT_FILE, 'Step 1: Failed\n');
            process.exit(1);
        }
    }
    else if (step === '--step2') {
        console.log('--- DB PERSISTENCE TEST: STEP 2 (Verify after Restart) ---');
        try {
            if (!fs.existsSync(STATE_FILE)) throw new Error('No state file found');
            const state = JSON.parse(fs.readFileSync(STATE_FILE));

            // Login again to be safe
            const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
                email: 'admin@smoke.test', password: 'password123'
            });
            const token = loginRes.data.token;

            const listRes = await axios.get(`${BASE_URL}/api/excel.json?project=default`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const doc = listRes.data.rows.find(r => r.id === state.id);
            if (!doc) throw new Error('Doc not found in Step 2');

            console.log(`Target Doc: ${doc.id}`);
            console.log(`Current Customer: ${doc.customer}`);
            console.log(`Expected Customer: ${state.expected}`);

            if (doc.customer !== state.expected) {
                fs.appendFileSync(OUTPUT_FILE, `Step 2: FAILED. Expected ${state.expected}, got ${doc.customer}\n`);
                console.error('Persistence Check Failed');
            } else {
                fs.appendFileSync(OUTPUT_FILE, `Step 2: SUCCESS. Updates persisted across restart.\n`);
                console.log('Persistence Check Passed');
                // Log DB adapter proof if possible (from server stdout? handled by agent)
            }

        } catch (e) {
            console.error('Step 2 Failed:', e.message);
            fs.appendFileSync(OUTPUT_FILE, `Step 2: Failed (${e.message})\n`);
            process.exit(1);
        }
    }
}

run();
