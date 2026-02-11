const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_ROOT, 'db.sqlite');
const PROJ_DIR = path.join(DATA_ROOT, 'projects/Proj_2026');
const BACKUP_DIR = path.join(DATA_ROOT, 'projects/Proj_2026_CLEANUP_BACKUP_' + Date.now());

async function run() {
    console.log("=== LIMPANDO PROJ_2026 PARA TESTES REAIS ===");

    // 1. Database Cleanup (Main)
    const knex = require('knex')({
        client: 'sqlite3',
        connection: { filename: DB_PATH },
        useNullAsDefault: true
    });

    try {
        const deletedDocs = await knex('documents').where({ project: 'Proj_2026' }).delete();
        console.log(`- Removidos ${deletedDocs} documentos da DB principal.`);

        const deletedBackups = await knex('document_backups').where({ project: 'Proj_2026' }).delete();
        console.log(`- Removidos ${deletedBackups} backups da DB principal.`);

        // Also clean doc_links if any
        const deletedLinks = await knex('doc_links').where({ project: 'Proj_2026' }).delete();
        console.log(`- Removidos ${deletedLinks} links entre documentos.`);

    } catch (e) {
        console.error("Erro na limpeza da DB principal:", e.message);
    } finally {
        await knex.destroy();
    }

    // 2. Satellite Cleanup
    const satelliteFiles = [
        path.join(DATA_ROOT, 'extractors/nicolazzi_proformas.sqlite'),
        path.join(DATA_ROOT, 'extractors/nicolazzi_invoices.sqlite')
    ];

    for (const satPath of satelliteFiles) {
        if (fs.existsSync(satPath)) {
            try {
                const satDb = require('knex')({
                    client: 'sqlite3',
                    connection: { filename: satPath },
                    useNullAsDefault: true
                });
                const deletedExt = await satDb('extractions').delete();
                console.log(`- Base satélite ${path.basename(satPath)} limpa (${deletedExt} registos).`);
                await satDb.destroy();
            } catch (e) {
                console.warn(`Falha ao limpar satélite ${satPath}:`, e.message);
            }
        }
    }

    // 3. Filesystem Move (Backup instead of Delete)
    if (fs.existsSync(PROJ_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const subfolders = ['staging', 'archive', 'batches'];

        for (const sub of subfolders) {
            const src = path.join(PROJ_DIR, sub);
            if (fs.existsSync(src)) {
                const dest = path.join(BACKUP_DIR, sub);
                fs.renameSync(src, dest);
                console.log(`- Pasta '${sub}' movida para backup em ${dest}`);
                fs.mkdirSync(src, { recursive: true }); // Re-create empty
            }
        }
    }

    console.log("=== LIMPEZA CONCLUÍDA. PRONTO PARA REINICIAR TESTES REAIS ===");
}

run().catch(console.error);
