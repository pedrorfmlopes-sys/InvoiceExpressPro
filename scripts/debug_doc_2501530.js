const knex = require('../server/src/db/knex');

async function debugDoc() {
    try {
        const docNumber = '25/01530';
        console.log(`Searching for document: ${docNumber}...`);

        const doc = await knex('documents').where({ docNumber }).first();

        if (!doc) {
            console.error("Document NOT FOUND in 'documents' table.");
            return;
        }

        console.log(`\n[MAIN DOC] ID: ${doc.id}`);
        console.log(`[MAIN DOC] Created At: ${doc.created_at}`);

        let mainJson = doc.rawJson;
        if (typeof mainJson === 'string') mainJson = JSON.parse(mainJson);

        console.log("[MAIN DOC] Extracted ShipTo:", JSON.stringify(mainJson?.entities?.shipTo, null, 2));


        // Check Satellite
        const sat = await knex('extraction_data').where({ document_id: doc.id }).first();

        if (sat) {
            console.log(`\n[SATELLITE/DRAFT] Found! Updated At: ${sat.updated_at}`);
            let satJson = sat.data;
            if (typeof satJson === 'string') satJson = JSON.parse(satJson);
            console.log("[SATELLITE] Draft ShipTo:", JSON.stringify(satJson?.entities?.shipTo, null, 2));

            // Check if they differ
            const mainAddr = mainJson?.entities?.shipTo?.address || '';
            const satAddr = satJson?.entities?.shipTo?.address || '';

            if (mainAddr !== satAddr) {
                console.log("\n!!! DISCREPANCY FOUND !!!");
                console.log(`Main Doc has: "${mainAddr}"`);
                console.log(`Satellite has: "${satAddr}"`);
                console.log("The Viewer prioritizes Satellite data.");
            } else {
                console.log("\nNo discrepancy in Address between Main and Satellite.");
            }
        } else {
            console.log("\n[SATELLITE/DRAFT] No draft found.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debugDoc();
