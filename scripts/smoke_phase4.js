const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
const OUTPUT_FILE = 'docs/RUNTIME_ENDPOINT_SMOKE_PHASE4.md';
let output = '# Phase 4 Smoke Test Results\n\n';

async function log(msg) {
    console.log(msg);
    output += msg + '\n';
}

async function run() {
    try {
        log(`Run at: ${new Date().toISOString()}`);
        log(`Mode: ${process.env.AUTH_MODE || 'optional'}`);

        // 1. Login/Bootstrap and Force Pro Plan
        const email = 'admin@smoke.test';
        let token = null;

        // DB Direct Access to force Pro
        try {
            const knex = require('../server/src/db/knex');
            // Ensure entitlements exist (just in case migration didn't run or something)
            // Actually, assuming migration ran. Just set subscription to pro.
            // Find user
            const user = await knex('users').where({ email }).first();
            if (user) {
                // Schema correction: Users dont have orgId. Memberships do.
                const membership = await knex('memberships').where({ userId: user.id }).first();
                if (membership && membership.orgId) {
                    await knex('subscriptions').where({ orgId: membership.orgId }).update({ planKey: 'pro' });
                    log('DB Force: Set plan to pro (org: ' + membership.orgId + ')');

                    // DEBUG: Check entitlements
                    const ents = await knex('entitlements').where({ planKey: 'pro', key: 'transactions' });
                    log('DB Debug: Pro Transactions Entitlement count: ' + ents.length);
                    if (ents.length === 0) {
                        log('DB Debug: MISSING ENTITLEMENTS in DB! Migration likely failed.');
                    }
                } else {
                    log('DB Force: User found but no membership?');
                }
            } else {
                // If user doesn't exist, we rely on bootstrap to create it (which defaults to pro now)
                log('DB Force: User not found yet, will bootstrap');
            }
            // We don't destroy knex yet as it might hang? Or we should destroy it?
            // knex.destroy(); // Wait, if we destroy, can we reuse it?
            // Actually, better to run this update in a separate small script or just here and destroy.
            // But if we require knex, it initializes.
            await knex.destroy();
        } catch (e) {
            log('DB Force Failed: ' + e.message);
        }

        try {
            const res = await axios.post(`${BASE_URL}/api/auth/login`, {
                email, password: 'password123'
            });
            token = res.data.token;
            log('Login: OK');
        } catch (e) {
            log('Login failed (' + e.message + '), trying bootstrap...');
            try {
                const b = await axios.post(`${BASE_URL}/api/auth/bootstrap`, {
                    email, password: 'password123'
                });
                token = b.data.token;
                log('Bootstrap: OK');
            } catch (be) {
                log('Bootstrap failed: ' + be.message);
            }
        }

        if (!token && process.env.AUTH_MODE === 'required') {
            throw new Error('Cannot proceed without token in required mode');
        }

        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // 2. Create Transaction
        let txId = null;
        try {
            const res = await axios.post(`${BASE_URL}/api/transactions`, {
                title: 'Smoke Transaction ' + Date.now(),
                counterparty: 'Smoke Corp'
            }, { headers });
            txId = res.data.id;
            log(`Create Transaction: OK (ID: ${txId})`);
        } catch (e) {
            log('Create Transaction: FAILED ' + e.message);
            if (e.response && e.response.status === 403) log('(Likely Entitlement Block)');
        }

        if (txId) {
            // 3. Link Doc
            // Need a doc ID. Fetch list.
            try {
                const list = await axios.get(`${BASE_URL}/api/excel.json?project=default`, { headers });
                const doc = list.data.rows[0];
                if (doc) {
                    await axios.post(`${BASE_URL}/api/transactions/${txId}/link`, {
                        documentId: doc.id,
                        linkType: 'invoice'
                    }, { headers });
                    log(`Link Doc (${doc.id}): OK`);
                } else {
                    log('Link Doc: Skipped (no docs)');
                }
            } catch (e) {
                log('Link Doc: FAILED ' + e.message);
            }

            // 4. Detail
            try {
                const res = await axios.get(`${BASE_URL}/api/transactions/${txId}`, { headers });
                const links = res.data.links.length;
                log(`Get Detail: OK (Links: ${links})`);
            } catch (e) {
                log('Get Detail: FAILED ' + e.message);
            }

            // 5. Suggestions
            try {
                const res = await axios.get(`${BASE_URL}/api/transactions/${txId}/suggestions`, { headers });
                log(`Suggestions: OK (Count: ${res.data.length})`);
            } catch (e) {
                log('Suggestions: FAILED ' + (e.response?.status === 403 ? '403 Forbidden' : e.message));
            }

            // 6. Zip Export
            try {
                const res = await axios.get(`${BASE_URL}/api/transactions/${txId}/download.zip`, {
                    headers,
                    responseType: 'arraybuffer'
                });
                log(`Download Zip: OK (Size: ${res.data.length} bytes)`);
            } catch (e) {
                log('Download Zip: FAILED ' + (e.response?.status === 403 ? '403 Forbidden' : e.message));
            }
        }

    } catch (e) {
        log('CRITICAL ERROR: ' + e.message);
    } finally {
        fs.writeFileSync(OUTPUT_FILE, output);
    }
}

run();
