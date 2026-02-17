
const knex = require('../server/src/db/knex');

async function run() {
    try {
        console.log("--- INSPECTING LATEST EXTRACTION ---");

        // Get latest doc from 'documents' table
        const doc = await knex('documents')
            .orderBy('created_at', 'desc')
            .first();

        if (!doc) {
            console.log("No documents found.");
            return;
        }

        console.log(`Document ID: ${doc.id}`);
        console.log(`File: ${doc.filePath}`);

        // Parse rawJson if it's a string, or use directly if object
        let json = doc.rawJson;
        if (typeof json === 'string') json = JSON.parse(json);

        const customer = json?.entities?.customer || {};
        const vat = customer?.vat;

        console.log("\n--- CUSTOMER DATA IN JSON ---");
        console.log("Name:", customer.name);
        console.log("Address:", customer.address);
        console.log("VAT (NIF):", vat);

        if (vat) {
            console.log("\n✅ VERDICT: Extraction WORKED. The NIF is in the JSON.");
            console.log("Issue must be in CustomerService creation logic.");
        } else {
            console.log("\n❌ VERDICT: Extraction FAILED. The NIF is missing from JSON.");
            console.log("Issue is in the Regex/Parser.");
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await knex.destroy();
    }
}

run();
