const knex = require('../server/src/db/knex');

async function debug() {
    console.log("--- DB DIAGNOSTIC ---");
    const doc = await knex('documents').orderBy('created_at', 'desc').first();
    if (!doc) {
        console.log("No documents found in DB.");
        return;
    }

    console.log(`Checking doc ID: ${doc.id}`);
    console.log(`Project: ${doc.project}`);
    console.log(`Status: ${doc.status}`);
    console.log(`rawJson length: ${doc.rawJson ? doc.rawJson.length : 'NULL'}`);

    if (doc.rawJson) {
        try {
            const parsed = JSON.parse(doc.rawJson);
            console.log("rawJson Keys:", Object.keys(parsed));
            if (parsed.entities) {
                console.log("Customer VAT:", parsed.entities.customer?.vat);
                console.log("Lines Count:", parsed.lines?.length);
            } else {
                console.log("WARNING: rawJson missing 'entities' key.");
            }
        } catch (e) {
            console.error("Failed to parse rawJson:", e.message);
        }
    }
}

debug().then(() => process.exit());
