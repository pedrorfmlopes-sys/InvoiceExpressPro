require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extractNicolazzi = require('./server/src/engine/nicolazziInvoiceTableExtraction_LAB');

const TMP_DIR = path.join(__dirname, 'TMP');

async function runBenchmark() {
    console.log("=== NICOLAZZI LAB BENCHMARK (V4.6 - POPPLER REAL) ===");
    const files = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.pdf'));

    for (const file of files) {
        const filePath = path.join(TMP_DIR, file);
        if (!fs.existsSync(filePath)) continue;

        const dataBuffer = fs.readFileSync(filePath);

        try {
            // Use real Poppler engine for 100% parity
            const text = await pdfBufferToTextPoppler(dataBuffer);
            const result = extractNicolazzi(text);

            const totalLines = result.lines.length;
            const linesWithSku = result.lines.filter(l => l.code && l.code.trim() !== "").length;
            const linesWithRef = result.lines.filter(l => l.projectRef && l.projectRef.trim() !== "").length;

            console.log(`[${file}]`);
            console.log(`   -> Doc: ${result.docNumber || '??'} | Project: ${result.projectRef || '??'}`);
            console.log(`   -> Total Lines: ${totalLines} | SKUs Found: ${linesWithSku} | Line Refs Found: ${linesWithRef}`);

            if (totalLines > 0 && linesWithRef === 0) {
                console.log("   ⚠️  WARNING: No line-level Refs found for this document.");
            }

            if (linesWithSku < totalLines) {
                console.log("   ❌ ERROR: Missing SKUs on some lines.");
                result.lines.forEach((l, idx) => {
                    if (!l.code) console.log(`      Line ${idx + 1} Descr: ${l.description.substring(0, 40)}...`);
                });
            }
            console.log("-----------------------------------------");

        } catch (e) {
            console.error(`Error processing ${file}:`, e.message);
        }
    }
}

runBenchmark();
