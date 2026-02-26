const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const ritmonioInvoiceExtraction = require('../server/src/engine/ritmonioInvoiceExtraction');
const ritmonioConfirmationExtraction = require('../server/src/engine/ritmonioConfirmationExtraction');

async function testExtractors() {
    console.log("=== RITMONIO EXTRACTION DIAGNOSTIC ===");
    console.log("Target: Analyze format compatibility with Nicolazzi Viewer/Logistics Module\n");

    const invoicePath = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\FA5 2504904.pdf';
    const confPath = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\ns conf ord 25.pdf';

    try {
        console.log(`[TEST 1] Processing Invoice: ${path.basename(invoicePath)}`);
        const invBuffer = fs.readFileSync(invoicePath);
        const invPdfParse = await pdfParse(invBuffer);
        const invData = await ritmonioInvoiceExtraction(invBuffer, invPdfParse.text);

        console.log(`\n--- INVOICE EXTRACTION RESULTS ---`);
        console.log(`- Doc Number: ${invData.docNumber}`);
        console.log(`- Shipping Mark (Order Ref): ${invData.docRefs?.customerOrder?.number || 'N/A'}`);
        console.log(`- Subtotal: ${invData.totals?.subtotal}, Total: ${invData.totals?.total}`);
        console.log(`- Lines Detected: ${invData.lines.length}`);
        if (invData.lines.length > 0) {
            console.log(`- Sample Line 1 Code: ${invData.lines[0].code}`);
            console.log(`- Sample Line 1 Desc: ${invData.lines[0].description}`);
            console.log(`- Sample Line 1 Qty: ${invData.lines[0].quantity}`);
        }

    } catch (err) {
        console.error("Error Processing Invoice:", err);
    }

    console.log("\n------------------------------------------------------\n");

    try {
        console.log(`[TEST 2] Processing Confirmation: ${path.basename(confPath)}`);
        const confBuffer = fs.readFileSync(confPath);
        const confPdfParse = await pdfParse(confBuffer);
        const confData = await ritmonioConfirmationExtraction(confBuffer, confPdfParse.text);

        console.log(`\n--- CONFIRMATION EXTRACTION RESULTS ---`);
        // The confirmation extractor uses slightly different keys (proposalNumber)
        console.log(`- Order Number: ${confData.proposalNumber || confData.docNumber || 'N/A'}`);
        console.log(`- Subtotal: ${confData.totals?.subtotal || '?'}, Total: ${confData.totals?.total}`);
        console.log(`- Lines Detected: ${confData.lines ? confData.lines.length : '0'}`);
        if (confData.lines && confData.lines.length > 0) {
            // Confirmations might use code/sku differently
            console.log(`- Sample Line 1 Sku/Code: ${confData.lines[0].sku || confData.lines[0].code}`);
            console.log(`- Sample Line 1 Qty: ${confData.lines[0].qty || confData.lines[0].quantity}`);
            console.log(`- Sample Line 1 Del. Date: ${confData.lines[0].delivery_date || 'N/A'}`);
        }
    } catch (err) {
        console.error("Error Processing Confirmation:", err);
    }
}

testExtractors();
