const sqlite3 = require('sqlite3');
const path = require('path');
const knex = require('knex');

const PROJECT_ROOT = process.cwd();
const DB_PATH = path.join(PROJECT_ROOT, 'data/db.sqlite');
const SAT_DB_PATH = path.join(PROJECT_ROOT, 'data/extractors/nicolazzi_proformas.sqlite');
const DOC_ID = process.argv[2] || '652bb839-9027-4d3b-a24b-671352e8ae74';

async function inspect() {
    console.log(`Inspecting Document: ${DOC_ID}`);

    // 1. Check Main DB
    const db = knex({
        client: 'sqlite3',
        connection: { filename: DB_PATH },
        useNullAsDefault: true
    });

    console.log('\n--- Main DB (documents) ---');
    try {
        const doc = await db('documents').where({ id: DOC_ID }).first();
        if (doc) {
            console.log('ID:', doc.id);
            console.log('Number:', doc.docNumber);
            console.log('Status:', doc.status);
            console.log('Total:', doc.total);
            console.log('Updated:', doc.updated_at);
            console.log('RawJson Size:', doc.rawJson ? doc.rawJson.length : 0);
        } else {
            console.log('Not Found in Main DB');
        }
    } catch (e) {
        console.error('Main DB Error:', e.message);
    }
    await db.destroy();

    // 2. Check Satellite DB
    console.log('\n--- Satellite DB (extractions) ---');
    const satDb = new sqlite3.Database(SAT_DB_PATH);
    satDb.get("SELECT * FROM extractions WHERE docId = ?", [DOC_ID], (err, row) => {
        if (err) console.error('Sat DB Error:', err.message);
        else if (row) {
            console.log('Found in Satellite!');
            console.log('Created:', new Date(row.createdAt).toISOString());
            console.log('Updated:', new Date(row.updatedAt).toISOString());
            const data = JSON.parse(row.dataJson);
            console.log('Data Total:', data.total || data.totals?.gross);
            console.log('Data Lines:', data.lines?.length);
        } else {
            console.log('Not Found in Satellite DB');
        }
        satDb.close();
    });
}

inspect();
