const fs = require('fs');
const path = require('path');
const engine = require('../server/src/engine/engine');
const pdfParse = require('pdf-parse'); // Fast rough text to feed into the engine initially

process.env.PDFTOTEXT_PATH = path.resolve(__dirname, '../../deps/poppler/poppler-24.08.0/Library/bin/pdftotext.exe');

async function testEngine() {
    const pdfPath = path.resolve(__dirname, '../tests/ritmonio_test/fatura.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // The Express router first uses pdfParse to get rough text before passing to engine
    const rawParsed = await pdfParse(pdfBuffer);
    const text = rawParsed.text;

    console.log(">>> Sending to Engine.process(text, buffer) <<<");
    const result = await engine.process(text, pdfBuffer);

    console.log("\n\n=== ENGINE RESULT ===");
    console.log("- DocType:", result.docType);
    console.log("- DocNumber:", result.docNumber);
    console.log("- Totals:", JSON.stringify(result.totals, null, 2));
    console.log("- Lines Found:", result.lines ? result.lines.length : 0);
    if (result.lines && result.lines.length > 0) {
        console.log("- Sample Line:", JSON.stringify(result.lines[0], null, 2));
    }
}

testEngine().catch(console.error);
