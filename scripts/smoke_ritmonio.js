const fs = require('fs');
const engine = require('../server/src/engine/engine');
const path = require('path');
const { pdfBufferToTextPoppler } = require('../server/src/utils/popplerText');
process.env.PDFTOTEXT_PATH = 'C:\\Users\\pedro\\OneDrive\\APPS\\poppler-25.12.0\\Library\\bin\\pdftotext.exe';

async function run() {
    const files = [
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\fa5.522.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\fa5.1564.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\Fattura_FA5 B2500260_C013316.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\Fattura_FA5 B2500592_C013316.PDF.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\Fattura_FA5 B2500721_C013316.PDF.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\Fattura_FA5 B2501052_C013316.PDF.pdf',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas\\FA5 2504904.pdf'
    ];

    console.log(`Starting batch test for ${files.length} files...\n`);

    for (const f of files) {
        const basename = path.basename(f);
        process.stdout.write(`Processing ${basename}... `);

        if (!fs.existsSync(f)) {
            console.log("FAILED (File not found)");
            continue;
        }

        try {
            const buffer = fs.readFileSync(f);
            const text = pdfBufferToTextPoppler(buffer);
            const res = await engine.process(text, buffer);

            const linesCount = res.lines.length;
            const total = res.totals.total;
            const hasAddress = !!res.entities.customer.address;
            const hasDelivery = !!res.entities.customer.deliveryAddress;
            const hasVat = !!res.entities.customer.vat;
            const hasRefs = res.docRefs && (res.docRefs.deliveryNote || res.docRefs.orderConfirmation);

            if (linesCount > 0 && total > 0 && hasAddress && hasVat) {
                console.log(`OK! (Lines: ${linesCount}, Total: ${total}, Billing: ${hasAddress ? 'Y' : 'N'}, Delivery: ${hasDelivery ? 'Y' : 'N'}, Refs: ${hasRefs ? 'Y' : 'N'})`);
            } else {
                console.log(`WARNING (Lines: ${linesCount}, Total: ${total}, Billing: ${hasAddress ? 'Y' : 'N'}, Delivery: ${hasDelivery ? 'Y' : 'N'}, VAT: ${hasVat ? 'Y' : 'N'})`);
            }

            const outName = `batch_res_${basename.replace(/\.pdf$/i, '')}.json`;
            const outputPath = path.join(__dirname, outName);
            fs.writeFileSync(outputPath, JSON.stringify(res, null, 2));
        } catch (err) {
            console.log(`ERROR: ${err.message}`);
        }
    }
    console.log("\nBatch test complete. Check scripts/ folder for JSON results.");
}
run().catch(console.error);
