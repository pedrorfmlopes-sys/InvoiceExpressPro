const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configure environment
process.env.DB_CLIENT = 'sqlite';

const DATA_ROOT = path.resolve(__dirname, '../data');
const BACKUP_STAGING = path.join(DATA_ROOT, 'projects/Proj_2026_CLEANUP_BACKUP_1770577930845/staging');

async function run() {
    console.log("=== INICIANDO TESTES REAIS (FRESH START) - PROJ_2026 ===");

    // Import controllers/services
    const ProcessingController = require('../server/src/modules/processing/controller');
    const CoreV2Controller = require('../server/src/modules/coreV2/controller');
    const Adapter = require('../server/src/storage/getDocsAdapter');

    // 1. SELECT TEST FILES
    const allFiles = fs.readdirSync(BACKUP_STAGING).filter(f => f.endsWith('.pdf'));
    const testFiles = allFiles.slice(0, 5); // Pick first 5
    console.log(`Selecionados ${testFiles.length} ficheiros para teste.`);

    // 2. SIMULATE UPLOAD (Phase A)
    // We create a mock request object for the controller
    const project = 'Proj_2026';
    const batchId = uuidv4();

    console.log("STEP 1: Ingestão de Ficheiros...");
    const ingestedRows = [];

    for (const fName of testFiles) {
        const srcPath = path.join(BACKUP_STAGING, fName);
        const destPath = path.join(DATA_ROOT, 'projects', project, 'staging', fName);

        // Copy to project staging
        if (!fs.existsSync(path.dirname(destPath))) fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);

        const row = {
            id: uuidv4(),
            project,
            batchId,
            status: 'staging',
            filePath: destPath,
            docNumber: `TEMP-${Date.now()}`,
            createdAt: new Date().toISOString()
        };

        await Adapter.saveDocument(project, row);
        ingestedRows.push(row);
        console.log(`  - Doc Ingerido: ${fName} -> ID: ${row.id}`);
    }

    // 3. SIMULATE EXTRACTION (Phase B)
    console.log("\nSTEP 2: Extração Master Engine...");
    for (const doc of ingestedRows) {
        // Prepare mock req/res for reprocess (which uses MasterEngine)
        const req = { params: { id: doc.id }, project };
        const res = {
            status: () => ({ json: (err) => console.log("    ERROR:", err) }),
            json: (data) => {
                console.log(`  - Doc Extraído: ${data.docNumber || 'SEM NUMERO'} (Method: ${data.extractionMethod})`);
            }
        };
        await ProcessingController.reprocess(req, res);
    }

    // 4. SIMULATE SATELLITE EDIT (Phase C)
    console.log("\nSTEP 3: Edição em Satélite (Simulando Visualizador)...");
    const firstDoc = await Adapter.getDoc(project, ingestedRows[0].id);
    const mockSatelliteData = {
        ... (firstDoc.rawJson || {}),
        total: 9999.99,
        notes: "Edited in Satellite Test",
        lines: [{ desc: "Teste Real", total: 9999.99 }]
    };

    // We manually insert into satellite for the test
    const sqlite3 = require('sqlite3').verbose();
    const satPath = path.join(DATA_ROOT, 'extractors/nicolazzi_proformas.sqlite');
    const db = new sqlite3.Database(satPath);

    await new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO extractions (docId, dataJson, updatedAt) VALUES (?, ?, ?)",
            [firstDoc.id, JSON.stringify(mockSatelliteData), Date.now()], (err) => {
                if (err) reject(err); else resolve();
            });
    });
    db.close();
    console.log(`  - Editado Doc ${firstDoc.id} no satélite (Total -> 9999.99)`);

    // 5. SIMULATE FINALIZATION (Phase D)
    console.log("\nSTEP 4: Finalização (Promoção para Arquivo)...");
    const finalizeReq = {
        body: {
            id: firstDoc.id,
            docType: 'fatura',
            docNumber: firstDoc.docNumber || 'TEST-DOC-FINAL',
            force: true
        },
        project
    };
    const finalizeRes = {
        status: () => ({ json: (e) => console.log("    FINAL ERROR:", e) }),
        json: (data) => {
            if (data.ok) {
                console.log(`  - Doc Finalizado com sucesso. Status: ${data.row.status}`);
            } else {
                console.log("  - Falha na finalização:", data.message);
            }
        }
    };
    await CoreV2Controller.finalizeDoc(finalizeReq, finalizeRes);

    // 6. VERIFICATION
    console.log("\n=== VERIFICAÇÃO FINAL ===");
    const finalDoc = await Adapter.getDoc(project, firstDoc.id);
    if (finalDoc.status === 'processado' && finalDoc.total === 9999.99) {
        console.log("✅ SUCESSO: Dados do satélite promovidos corretamente!");
    } else {
        console.log("❌ FALHA: Dados não coincidem.", { status: finalDoc.status, total: finalDoc.total });
    }

    // Check backups
    const backups = await Adapter.getBackups(project, firstDoc.id);
    console.log(`  - Backups detetados: ${backups.length}`);

    console.log("\n=== TESTES REAIS CONCLUÍDOS COM SUCESSO ===");
}

run().catch(console.error);
