const knex = require('../server/src/db/knex');

async function checkDocuments() {
    console.log("=== VERIFICAR DOCUMENTOS PÓS-UPLOAD ===\n");

    try {
        const docs = await knex('documents')
            .where({ project: 'Proj_2026' })
            .orderBy('created_at', 'desc')
            .limit(5)
            .select('*');

        console.log(`📊 Total de documentos recentes: ${docs.length}\n`);

        for (const doc of docs) {
            console.log("─".repeat(60));
            console.log(`ID: ${doc.id}`);
            console.log(`Doc: ${doc.docNumber} (${doc.docType})`);
            console.log(`Status: ${doc.status}`);
            console.log(`Created: ${doc.created_at}`);
            console.log(`File: ${doc.filePath}`);

            // Check raw_data
            if (doc.raw_data) {
                const rawData = typeof doc.raw_data === 'string'
                    ? JSON.parse(doc.raw_data)
                    : doc.raw_data;

                console.log(`✅ raw_data: SIM (${Object.keys(rawData).length} keys)`);
                console.log(`   Keys: ${Object.keys(rawData).slice(0, 5).join(', ')}...`);

                if (rawData.items) {
                    console.log(`   Items: ${rawData.items.length}`);
                }
            } else {
                console.log(`❌ raw_data: NÃO`);
            }

            console.log();
        }

    } catch (err) {
        console.error("❌ ERRO:", err.message);
        console.error(err.stack);
    } finally {
        await knex.destroy();
    }
}

checkDocuments();
