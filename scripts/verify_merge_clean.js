const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { v4: uuidv4 } = require('uuid');

const PROJECT_ROOT = process.cwd();
const DB_PATH = path.join(PROJECT_ROOT, 'data/db.sqlite');
const SAT_DB_PATH = path.join(PROJECT_ROOT, 'data/extractors/nicolazzi_proformas.sqlite');
// Set ENV for Adapter
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = DB_PATH; // Ensure Knex uses the same path

// Require Controller Directly
const controller = require('../server/src/modules/coreV2/controller');

async function verifyMergeAndClean() {
    console.log('Verifying Merge & Clean Strategy (Direct Controller Mode)...');
    console.log('DB Path:', DB_PATH);
    console.log('Sat Path:', SAT_DB_PATH);

    // 0. Setup: Ensure DBs exists
    if (!fs.existsSync(DB_PATH)) {
        console.error('Main Database file missing.');
        return;
    }

    // Ensure satellite dir exists for our test seeding
    const satDir = path.dirname(SAT_DB_PATH);
    if (!fs.existsSync(satDir)) fs.mkdirSync(satDir, { recursive: true });

    const db = require('knex')({
        client: 'sqlite3',
        connection: { filename: DB_PATH },
        useNullAsDefault: true
    });

    const satDb = new sqlite3.Database(SAT_DB_PATH);

    // 1. Seed a Dummy Document in Main DB (Staging Status)
    const docId = uuidv4();
    const docNumber = 'TEST-MERGE-' + Date.now();
    console.log(`\nSTEP 1: Seeding Document ${docId}...`);

    await db('documents').insert({
        id: docId,
        project: 'default',
        status: 'uploaded',
        docNumber: 'PENDING',
        total: 0,
        rawJson: JSON.stringify({ original: true }),
        created_at: new Date(),
        updated_at: new Date()
    });
    console.log('Seeded in Main DB.');

    // 2. Seed "Edited" Data in Satellite DB
    console.log('\nSTEP 2: Seeding Satellite Data (Simulating Edit)...');
    const satelliteData = {
        docNumber: docNumber,
        total: 5000.50,
        date: '2026-05-20',
        lines: [{ desc: 'Item Edited', total: 5000.50 }],
        totals: { gross: 5000.50 }
    };

    await new Promise((resolve, reject) => {
        satDb.run("INSERT INTO extractions (docId, dataJson, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
            [docId, JSON.stringify(satelliteData), Date.now(), Date.now()],
            (err) => err ? reject(err) : resolve()
        );
    });
    console.log('Seeded into Satellite DB.');

    // 3. Call Finalize (Direct Controller)
    console.log('\nSTEP 3: Calling Finalize Controller...');

    // Mock Req/Res
    const req = {
        project: 'default',
        body: {
            id: docId,
            docType: 'fatura',
            docNumber: docNumber
        }
    };

    const res = {
        statusCode: 200,
        status: function (code) { this.statusCode = code; return this; },
        json: function (data) {
            console.log(`[Response ${this.statusCode}]`, JSON.stringify(data, null, 2));
            if (this.statusCode >= 400) {
                console.error('Controller Error:', data);
            }
        }
    };

    try {
        // Need to create dummy file for DocService (it checks file existence usually)
        const stagingPath = path.resolve(PROJECT_ROOT, `data/staging/v2_staging_dummy_${docId}.pdf`);
        if (!fs.existsSync(path.dirname(stagingPath))) fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
        fs.writeFileSync(stagingPath, 'dummy pdf content');

        // Update doc path in DB
        await db('documents').where({ id: docId }).update({ filePath: stagingPath });

        // Call Controller
        await controller.finalizeDoc(req, res);

    } catch (e) {
        console.error('Controller Threw Exception:', e);
    }

    // 4. Verify Merge
    console.log('\nSTEP 4: Verifying Main DB Merge...');
    const finalDoc = await db('documents').where({ id: docId }).first();
    const finalRaw = JSON.parse(finalDoc.rawJson || '{}');

    if (finalDoc.total === 5000.50 && finalDoc.docNumber === docNumber) {
        console.log('✅ KEY COLUMNS UPDATED: Total=5000.50');
    } else {
        console.error('❌ KEY COLUMNS FAILED:', finalDoc.total);
    }

    if (finalRaw.totals?.gross === 5000.50 && finalRaw.lines?.length === 1) {
        console.log('✅ RAW JSON MERGED: Structure correct.');
    } else {
        console.error('❌ RAW JSON MERGED FAILED:', finalRaw);
    }

    // 5. Verify Clean
    console.log('\nSTEP 5: Verifying Satellite Clean...');
    const satRow = await new Promise((resolve, reject) => {
        satDb.get("SELECT * FROM extractions WHERE docId = ?", [docId], (err, row) => resolve(row));
    });

    if (!satRow) {
        console.log('✅ SATELLITE CLEANED.');
    } else {
        console.error('❌ SATELLITE NOT CLEANED.');
    }

    satDb.close();
    await db.destroy();
}

verifyMergeAndClean();
