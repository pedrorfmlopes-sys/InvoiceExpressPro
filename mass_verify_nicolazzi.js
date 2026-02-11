const fs = require('fs');
const path = require('path');
process.env.PDFTOTEXT_PATH = 'C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe';
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extractNicolazziTable = require('./server/src/engine/nicolazziProformaTableExtraction');

async function massVerify() {
    const proformaDir = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas';

    if (!fs.existsSync(proformaDir)) {
        console.error(`Directory not found: ${proformaDir}`);
        return;
    }

    const files = fs.readdirSync(proformaDir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(proformaDir, f));

    console.log(`\n=== MASS VERIFICATION OF NICOLAZZI PROFORMAS (${files.length} files) ===\n`);

    for (const file of files) {
        try {
            const buffer = fs.readFileSync(file);
            const text = pdfBufferToTextPoppler(buffer);
            const result = extractNicolazziTable(text);

            console.log(`[FILE] ${path.basename(file)}`);
            console.log(`  - Doc #: ${result.docNumber}`);
            console.log(`  - Customer: ${result.entities.customer.name}`);
            console.log(`  - VAT: ${result.entities.customer.vat || 'N/A'}`);
            console.log(`  - Ship-To: ${result.entities.shipTo.name || 'N/A'}`);
            console.log(`  - Project: ${result.docRefs.customerRef || 'N/A'}`);
            console.log(`  - Subtotal: ${result.totals.subtotal}`);
            console.log(`  - Transport: ${result.totals.transport}`);
            console.log(`  - Total: ${result.totals.total}`);
            console.log(`  - Lines: ${result.lines.length}`);
            if (result.needsReview) console.log(`  - NEEDS REVIEW: ${result.reviewReason || "Unknown Reason"}`);

            if (result.lines.length > 0) {
                const firstLine = result.lines[0];
                console.log(`  - Sample Line: Code=${firstLine.code}, Qty=${firstLine.quantity}, Total=${firstLine.total}`);
                console.log(`  - Description: ${firstLine.description}`);
            }
            console.log('--------------------------------------------------');
        } catch (err) {
            console.error(`  - ERROR processing ${path.basename(file)}:`, err.message);
        }
    }
}

massVerify().catch(console.error);
