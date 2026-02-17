const fs = require('fs');
const path = require('path');
const extractFromText = require('../server/src/engine/extractFromText');
const pdf = require('pdf-parse');
const CustomerService = require('../server/src/modules/crm/CustomerService');

async function smokeTest() {
    const filePath = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\04 - OFFICINA NICOLAZZI\\Propostas 2025\\904.pdf';
    console.log(`--- Smoke Test: 904.pdf ---`);

    if (!fs.existsSync(filePath)) {
        console.error("File not found!");
        return;
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    console.log("PDF Text length:", text.length);
    // console.log("Text Sample:", text.substring(0, 500));

    const extracted = extractFromText(text);
    console.log("Extracted Data:", JSON.stringify(extracted.entities, null, 2));

    if (extracted.entities && extracted.entities.customer) {
        console.log("Customer Found:", extracted.entities.customer);
    } else {
        console.log("No Customer Found in entities.");
    }

    // Test CRM Sync logic
    const project = 'pedrorfmlopes-sys/InvoiceExpressPro';
    try {
        const customer = await CustomerService.upsertFromExtraction(project, extracted, false);
        console.log("CRM Result:", customer);
    } catch (e) {
        console.error("CRM Sync Failed:", e.message);
    }
}

smokeTest().then(() => process.exit());
