require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function run() {
    try {
        // Need a valid ID. I'll pick one from previous error msg or try to list one first.
        // Or assume the ID in the user msg exists? 'fa015429-052e-4362-86fa-b66269787946'
        const id = '1de7f6ac-7982-4c62-9b36-0677f2d645df';

        // I need to login first or use a mocked token if auth enabled.
        // Tests use `run_smoke_with_server` which handles auth.
        // I'll try to just hit the endpoint if I can get a token?
        // Actually, I can use `knex` directly to test `Service.updateDoc` logic without HTTP to isolate SQL error.

        const Service = require('../server/src/modules/explorer/service');
        const knex = require('../server/src/db/knex');

        console.log("Testing updateDoc...");

        // Check if doc exists
        const exists = await knex('documents').where({ id }).first();
        if (!exists) {
            console.log("Doc not found, creating dummy.");
            await knex('documents').insert({
                id: 'dummy-123',
                project: 'default',
                docNumber: 'TEST',
                updated_at: new Date()
            });
        }

        const targetId = exists ? id : 'dummy-123';

        try {
            const res = await Service.updateDoc(targetId, 'default', { docType: 'Recibo' });
            console.log("Success:", res);
        } catch (e) {
            console.error("Service Error:", e);
        }

        process.exit(0);

    } catch (e) {
        console.error("Script Error:", e);
        process.exit(1);
    }
}

run();
