// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';

const axios = require('axios');
const app = require('../server/src/app');
const http = require('http');
const knex = require('../server/src/db/knex');

const PORT = 3007;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
    console.log(`\n# Hotfix Verification (Port ${PORT})`);

    // 1. Verify Schema Columns
    console.log('1. Verifying Schema Columns...');
    try {
        const hasCustomer = await knex.schema.hasColumn('transactions', 'customer_name');
        const hasOrg = await knex.schema.hasColumn('transactions', 'orgId');
        if (!hasCustomer) throw new Error('Missing customer_name column');
        if (!hasOrg) throw new Error('Missing orgId column');
        console.log('   Schema OK: customer_name and orgId present.');
    } catch (e) {
        console.error('Schema Check Failed:', e.message);
        process.exit(1);
    }

    const server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));

    try {
        // 2. Verify Transaction Creation (API Level)
        console.log('2. Creating Transaction via API...');
        const res = await axios.post(`${BASE_URL}/api/v2/transactions?project=default`, {
            title: 'Hotfix Test Case',
            customer_name: 'Customer A',   // Testing new cols
            supplier_name: 'Supplier B'
        });
        const tx = res.data.transaction;
        if (!tx.id) throw new Error('No ID returned');

        // 3. Verify DB persistence of new cols
        const row = await knex('transactions').where({ id: tx.id }).first();
        if (row.customer_name !== 'Customer A') throw new Error('customer_name not persisted');
        if (row.orgId !== 'default') throw new Error('orgId not valid default');
        console.log('   Persistence OK: customer_name stored, orgId defaulted.');

        console.log('DONE. Hotfix Verified.');
    } catch (e) {
        console.error('FAIL:', e.message);
        if (e.response) console.error(e.response.data);
    } finally {
        server.close();
        knex.destroy();
    }
}
run();
