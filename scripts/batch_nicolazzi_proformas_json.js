const fs = require('fs');
const path = require('path');
process.env.PDFTOTEXT_PATH = 'C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe';
const { pdfBufferToTextPoppler } = require('../server/src/utils/popplerText');
const extractNicolazziTable = require('../server/src/engine/nicolazziProformaTableExtraction');

async function test() {
    const proformaDir = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas';
    const outputFile = path.join(process.cwd(), 'NICOLAZZI_PROFORMAS_BATCH_RESULTS.json');

    if (!fs.existsSync(proformaDir)) {
        console.error(`Directory not found: ${proformaDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(proformaDir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(proformaDir, f));

    const allResults = [];

    console.log(`Processing ${files.length} proformas...`);

    for (const file of files) {
        console.log(`Extracting: ${path.basename(file)}`);
        const buffer = fs.readFileSync(file);
        const text = pdfBufferToTextPoppler(buffer);
        const result = extractNicolazziTable(text);

        allResults.push({
            file: path.basename(file),
            ...result
        });
    }

    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
    console.log(`\nDONE! Results saved to: ${outputFile}`);
}

test().catch(console.error);
