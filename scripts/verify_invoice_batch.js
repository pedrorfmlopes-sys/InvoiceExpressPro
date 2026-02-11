const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const extractNicolazziInvoiceTable = require('../server/src/engine/nicolazziInvoiceTableExtraction');

// Configuration
const PDFTOTEXT_EXE = "C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe";
const BASE_PATH = path.join(__dirname, '..');

const SAMPLES = [
    "uploads/FT GEN-DIC 2025/SEPTIEMBRE/1173-B WATERWORKS.pdf",
    "uploads/FT GEN-DIC 2025/SEPTIEMBRE/1147-B MATAS.pdf",
    "uploads/FT GEN-DIC 2025/SEPTIEMBRE/1114-B DVTK.pdf"
];

console.log(`[BatchVerify] Starting verification on ${SAMPLES.length} files...`);
console.log(`[BatchVerify] Using pdftotext: ${PDFTOTEXT_EXE}`);

async function run() {
    for (const relPath of SAMPLES) {
        const fullPath = path.join(BASE_PATH, relPath);
        console.log(`\n--------------------------------------------------`);
        console.log(`[BatchVerify] Processing: ${path.basename(fullPath)}`);

        if (!fs.existsSync(fullPath)) {
            console.error(`❌ File not found: ${fullPath}`);
            continue;
        }

        try {
            // 1. Extract Text
            const text = execFileSync(PDFTOTEXT_EXE, ["-layout", "-enc", "UTF-8", fullPath, "-"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });

            // 2. Run Logic
            const result = extractNicolazziInvoiceTable(text);

            // 3. Report
            console.log(`   > DocNumber: ${result.docNumber}`);
            console.log(`   > Customer:  ${result.entities.customer.name}`);
            console.log(`   > Lines:     ${result.lines.length}`);
            console.log(`   > Total:     ${result.totals.total} (Calc: ${result.lines.reduce((a, b) => a + (b.total || 0), 0).toFixed(2)})`);

            // Validation
            if (result.lines.length > 0 && result.totals.total > 0 && result.docNumber) {
                console.log(`   ✅ PASS`);
            } else {
                console.log(`   ❌ FAIL (Missing data)`);
            }

        } catch (e) {
            console.error(`   ❌ ERROR: ${e.message}`);
        }
    }
}

run();
