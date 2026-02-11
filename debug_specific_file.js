const MasterEngine = require('./server/src/engine/engine');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const fs = require('fs');
const path = require('path');

// File path provided by user
const targetFile = `C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\04 - OFFICINA NICOLAZZI\\Propostas 2025\\314 STONECERAMIC.pdf`;

async function testFile() {
    console.log(`[Diagnostic] Reading file: ${targetFile}`);

    if (!fs.existsSync(targetFile)) {
        console.error("FATAL: File not found at path. Please double check the path.");
        return;
    }

    const buf = fs.readFileSync(targetFile);

    console.log("[Diagnostic] Extracting text via Poppler...");
    const text = await pdfBufferToTextPoppler(buf);

    const popplerLines = text.split('\n');
    console.log("\n--- RAW DATA PREVIEW (Zone Search) ---");
    popplerLines.forEach((l, i) => {
        if (l.match(/Pos\s*Article/i) || l.match(/Unit\s*Value/i)) {
            console.log(`[Line ${i}] ${l}`);
            for (let j = 1; j < 30; j++) {
                if (popplerLines[i + j]) console.log(`[Line ${i + j}] ${popplerLines[i + j]}`);
            }
        }
    });

    console.log("\n[Diagnostic] Running Master Engine...");
    const result = await MasterEngine.process(text, buf);

    console.log("\n--- EXTRACTION RESULTS (Summary) ---");
    console.log(`DocNumber: ${result.docNumber}`);
    console.log(`Date: ${result.dates?.issued}`);
    console.log(`Total: ${result.totals?.total}`);
    console.log(`Lines Found: ${result.lines?.length}`);

    if (result.lines && result.lines.length > 0) {
        console.log("\n--- FIRST 5 LINES ---");
        console.log(JSON.stringify(result.lines.slice(0, 5), null, 2));
    }
}

testFile().catch(e => {
    console.error("Test execution failed:", e);
});
