const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Mocking some constants for dry run or using real ones if possible
const DATA_ROOT = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_ROOT, 'db.sqlite');
const STAGING_DIR = path.join(DATA_ROOT, 'projects/Proj_2026/staging');

async function run() {
    console.log("=== DIAGNÓSTICO PROJ_2026 ===");

    if (!fs.existsSync(STAGING_DIR)) {
        console.error("Erro: Diretorio staging nao encontrado em", STAGING_DIR);
        return;
    }

    const files = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.pdf'));
    console.log(`Ficheiros físicos em Staging: ${files.length}`);

    const knex = require('knex')({
        client: 'sqlite3',
        connection: { filename: DB_PATH },
        useNullAsDefault: true
    });

    // 1. Check Main DB
    const dbDocs = await knex('documents').where({ project: 'Proj_2026' });
    console.log(`Documentos registados na DB (Main): ${dbDocs.length}`);

    // Map DB docs by filename (heuristic)
    const dbFileNames = new Set(dbDocs.map(d => path.basename(d.filePath || '')));

    const orphans = [];
    for (const f of files) {
        if (!dbFileNames.has(f)) {
            orphans.push(f);
        }
    }

    console.log(`Órfãos (No disco mas não na DB): ${orphans.length}`);

    // 2. Check Satellites
    const satProformasPath = path.join(DATA_ROOT, 'extractors/nicolazzi_proformas.sqlite');
    const satInvoicesPath = path.join(DATA_ROOT, 'extractors/nicolazzi_invoices.sqlite');

    async function checkSatellite(satPath) {
        if (!fs.existsSync(satPath)) return 0;
        const satDb = require('knex')({
            client: 'sqlite3',
            connection: { filename: satPath },
            useNullAsDefault: true
        });
        const count = await satDb('extractions').count('docId as n').first();
        await satDb.destroy();
        return count.n;
    }

    const proformasCount = await checkSatellite(satProformasPath);
    const invoicesCount = await checkSatellite(satInvoicesPath);

    console.log(`Extrações Nicolazzi (Satélite Proformas): ${proformasCount}`);
    console.log(`Extrações Nicolazzi (Satélite Invoices): ${invoicesCount}`);

    // 3. Sample check for specific errors (Recursion)
    const recursiveDocs = dbDocs.filter(d => {
        try {
            if (!d.rawJson) return false;
            const parsed = JSON.parse(d.rawJson);
            return parsed.rawJson !== undefined;
        } catch (e) {
            return false;
        }
    });

    console.log(`Documentos com recursividade rawJson: ${recursiveDocs.length}`);

    await knex.destroy();
    console.log("=== FIM DO DIAGNÓSTICO ===");
}

run().catch(console.error);
