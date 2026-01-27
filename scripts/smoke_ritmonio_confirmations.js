const fs = require('fs');
const path = require('path');
const { process: processDoc } = require('../server/src/engine/engine');
const { pdfBufferToTextPoppler } = require("../server/src/utils/popplerText");

// Set pdftotext path
process.env.PDFTOTEXT_PATH = 'C:\\Users\\pedro\\OneDrive\\APPS\\poppler-25.12.0\\Library\\bin\\pdftotext.exe';

async function runSmokeTest() {
    const files = [
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\C-2025-OA2-3146.PDF',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\C-2025-OA2-3307.PDF',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\C-2025-OA2-3824.PDF',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\C-2025-OA2-3855.PDF',
        'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes\\ns conf ord 25.pdf'
    ];

    console.log(`Starting batch test for ${files.length} Confirmations...\n`);

    for (const f of files) {
        const basename = path.basename(f);
        process.stdout.write(`Processing ${basename}... `);

        try {
            const buffer = fs.readFileSync(f);
            const text = pdfBufferToTextPoppler(buffer);
            const res = await processDoc(text, buffer);

            const linesCount = res.lines.length;
            const total = res.totals.total;
            const hasBilling = !!res.entities.customer.address;
            const hasDelivery = !!res.entities.customer.deliveryAddress;
            const hasVat = !!res.entities.customer.vat;
            const confidence = res.confidence;

            if (linesCount > 0 && total > 0 && hasBilling && confidence >= 0.9) {
                console.log(`OK! (Lines: ${linesCount}, Total: ${total}, Billing: Y, Delivery: ${hasDelivery ? 'Y' : 'N'}, Conf: ${confidence})`);
            } else {
                console.log(`WARNING (Lines: ${linesCount}, Total: ${total}, Billing: ${hasBilling ? 'Y' : 'N'}, Conf: ${confidence}, Reason: ${res.reviewReason || 'None'})`);
            }

            const outName = `batch_conf_${basename.replace(/\.pdf$/i, '')}.json`;
            fs.writeFileSync(path.join('scripts', outName), JSON.stringify(res, null, 2));

        } catch (err) {
            console.log(`ERROR: ${err.message}`);
        }
    }
    console.log('\nBatch test complete. Check scripts/ folder for JSON results.');
}

runSmokeTest();
