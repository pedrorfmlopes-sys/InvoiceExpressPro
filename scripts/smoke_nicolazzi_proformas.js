const fs = require('fs');
const path = require('path');
process.env.PDFTOTEXT_PATH = 'C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe';
const { pdfBufferToTextPoppler } = require('../server/src/utils/popplerText');
const extractNicolazziTable = require('../server/src/engine/nicolazziProformaTableExtraction');

async function test() {
    const proformaDir = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas';
    if (!fs.existsSync(proformaDir)) {
        console.error(`Directory not found: ${proformaDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(proformaDir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(proformaDir, f));

    console.log(`Found ${files.length} proformas in folder.`);

    for (const file of files) {
        console.log(`\nTesting: ${path.basename(file)}`);
        const buffer = fs.readFileSync(file);
        const text = pdfBufferToTextPoppler(buffer);
        const result = extractNicolazziTable(text);

        console.log('--- Result ---');
        console.log('DocNumber:', result.docNumber);
        console.log('Customer Ref:', result.docRefs?.customerRef);
        console.log('Customer Name:', result.entities.customer?.name);
        console.log('Delivery Address:', result.entities.customer?.deliveryAddress);
        console.log('ShipTo Name:', result.entities.shipTo?.name);
        console.log('Lines count:', result.lines.length);
        if (result.lines.length > 0) {
            console.log('First Line Discount:', result.lines[0].discountText);
        }
    }
}

test().catch(console.error);
