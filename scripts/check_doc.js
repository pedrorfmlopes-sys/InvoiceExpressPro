require('dotenv').config();
const knex = require('../server/src/db/knex');

async function run() {
    const id = '1de7f6ac-7982-4c62-9b36-0677f2d645df';
    const doc = await knex('documents').where({ id }).first();
    console.log("Doc Exists?", !!doc);
    if (doc) console.log("Doc:", doc);

    // Also test update
    if (doc) {
        const q = knex('documents').where({ id });
        // Simulating the query logic
        await q.update({ updated_at: new Date() });
        console.log("Update executed.");
    }

    process.exit(0);
}

run();
