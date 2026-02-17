const path = require('path');
const fs = require('fs');

// Mock helpers
const project = 'pedrorfmlopes-sys/InvoiceExpressPro'; // Default or arg
const ROOT = path.resolve(__dirname, '../');
const SERVER_ROOT = path.join(ROOT, 'server');
process.chdir(SERVER_ROOT);

// Use the initialized instance for Main DB
const knex = require(path.join(SERVER_ROOT, 'src/db/knex'));

async function migrate() {
    console.log(`[Migration] Starting Satellite -> Main DB Migration for ${project}`);

    // CORRECT PATH: data/extractors
    const SATELLITE_DIR = path.join(ROOT, 'data', 'extractors');
    const satPath = path.join(SATELLITE_DIR, 'nicolazzi_proformas.sqlite');

    if (!fs.existsSync(satPath)) {
        console.log(`[Migration] No satellite DB found at ${satPath}. Skipping.`);
        // Try to list dir to help debug
        try {
            console.log('Listing data/extractors:', fs.readdirSync(SATELLITE_DIR));
        } catch (e) { console.log('Could not list dir:', e.message); }
        process.exit(0);
    }

    // Use Knex for Satellite too
    const satKnex = require('knex')({
        client: 'sqlite3',
        connection: { filename: satPath },
        useNullAsDefault: true
    });

    try {
        // Check tables
        const tables = await satKnex('sqlite_master').where({ type: 'table' }).select('name');
        console.log('[Migration] Satellite Tables:', tables.map(t => t.name));

        // The table is always 'extractions' inside the satellite file
        const TABLE = 'extractions';
        if (!tables.find(t => t.name === TABLE)) {
            console.log(`[Migration] Table ${TABLE} not found. Something is wrong.`);
            process.exit(1);
        }

        console.log(`[Migration] -- Migrating from ${path.basename(satPath)} --`);
        const rows = await satKnex(TABLE).select('*');
        console.log(`[Migration] Found ${rows.length} records.`);

        for (const row of rows) {
            const id = row.docId; // Column is docId
            let data = {};
            try { data = JSON.parse(row.dataJson); } catch (e) { console.error('Bad JSON', id); continue; }

            // Check Main DB
            const mainDoc = await knex('documents').where({ id }).first();

            if (mainDoc) {
                console.log(`[Migration] Merging into existing doc ${id} (${mainDoc.docNumber})`);

                // Merge Logic
                let currentRaw = {};
                try { currentRaw = JSON.parse(mainDoc.rawJson || '{}'); } catch { }

                const mergedRaw = { ...currentRaw, ...data };

                // Update Main DB
                await knex('documents').where({ id }).update({
                    rawJson: JSON.stringify(mergedRaw),
                    updated_at: new Date()
                });
            } else {
                console.log(`[Migration] Insert missing doc from Satellite ${id}`);
                // Insert new
                await knex('documents').insert({
                    id,
                    project,
                    docType: data.docType || 'proforma',
                    docNumber: data.docNumber || '?',
                    status: 'staging',
                    rawJson: JSON.stringify(data),
                    created_at: new Date(),
                    updated_at: new Date()
                });
            }
        }

        console.log('[Migration] Done.');
        process.exit(0);

    } catch (e) {
        console.error("Migration Error:", e);
        process.exit(1);
    } finally {
        await satKnex.destroy();
    }
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
