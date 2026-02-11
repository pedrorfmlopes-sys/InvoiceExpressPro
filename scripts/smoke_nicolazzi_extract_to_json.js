const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const Engine = require('../server/src/engine/engine');

const testFiles = [
    { type: 'proforma', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/015.pdf' },
    { type: 'proforma', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/085.pdf' },
    { type: 'invoice', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Processadas/386b.pdf' },
    { type: 'invoice', path: 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Processadas/430b.pdf' }
];

const outputDir = path.join(__dirname, '../audit_json_results');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

async function runSmokeTests() {
    console.log('Starting Nicolazzi Smoke Tests...');

    for (const test of testFiles) {
        try {
            const fileName = path.basename(test.path);
            console.log(`Processing ${test.type}: ${fileName}...`);

            if (!fs.existsSync(test.path)) {
                console.warn(`File not found: ${test.path}`);
                continue;
            }

            const buffer = fs.readFileSync(test.path);
            const parsed = await pdf(buffer);
            const text = (parsed.text || '').trim();

            const normalized = await Engine.process(text, buffer);

            const outPath = path.join(outputDir, `${test.type}_${fileName}.json`);
            fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2));
            console.log(`Saved to ${outPath}`);

        } catch (err) {
            console.error(`Error processing ${test.path}:`, err);
        }
    }

    console.log('Smoke tests completed.');
    console.log(`Results available in: ${outputDir}`);
}

runSmokeTests();
