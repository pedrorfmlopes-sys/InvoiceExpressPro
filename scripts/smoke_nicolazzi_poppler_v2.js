const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('../server/src/utils/popplerText');
const Engine = require('../server/src/engine/engine');

// Configure Poppler Path for this environment
process.env.PDFTOTEXT_PATH = 'C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe';

const testFiles = [
    { type: 'proforma', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/015.pdf' },
    { type: 'proforma', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/085.pdf' },
    { type: 'invoice', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Processadas/386b.pdf' },
    { type: 'invoice', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Processadas/430b.pdf' }
];

const outputDir = path.join(__dirname, '../audit_json_results_poppler');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

async function runPopplerSmokeTests() {
    console.log('Starting Nicolazzi Smoke Tests WITH POPPLER...');

    for (const test of testFiles) {
        try {
            const fileName = path.basename(test.path);
            console.log(`Processing ${test.type} (Poppler): ${fileName}...`);

            if (!fs.existsSync(test.path)) {
                console.warn(`File not found: ${test.path}`);
                continue;
            }

            const buffer = fs.readFileSync(test.path);

            // USE POPPLER INSTEAD OF PDF-PARSE FOR TEXT
            const text = pdfBufferToTextPoppler(buffer);

            // Pass the improved text to the Engine
            const normalized = await Engine.process(text, buffer);

            const outPath = path.join(outputDir, `poppler_${test.type}_${fileName}.json`);
            fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2));
            console.log(`Saved to ${outPath}`);

        } catch (err) {
            console.error(`Error processing ${test.path}:`, err);
        }
    }

    console.log('Poppler smoke tests completed.');
    console.log(`Results available in: ${outputDir}`);
}

runPopplerSmokeTests();
