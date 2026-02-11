const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const extractNicolazziInvoiceTable = require('../server/src/engine/nicolazziInvoiceTableExtraction');

// Target PDF
// Using a relative path from project root
const PDF_REL_PATH = "uploads/FT GEN-DIC 2025/SEPTIEMBRE/1173-B WATERWORKS.pdf";
const PDF_PATH = path.join(__dirname, '..', PDF_REL_PATH);

console.log(`[Verify] Target PDF: ${PDF_PATH}`);

if (!fs.existsSync(PDF_PATH)) {
    console.error(`[Verify] File not found!`);
    process.exit(1);
}

// 1. Extract Text (Poppler Simulation)
const PDFTOTEXT_EXE = "C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe";

console.log(`[Verify] Extracting text with pdftotext (${PDFTOTEXT_EXE})...`);
let text = "";
try {
    text = execFileSync(PDFTOTEXT_EXE, ["-layout", "-enc", "UTF-8", PDF_PATH, "-"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
} catch (e) {
    console.error(`[Verify] pdftotext failed:`, e.message);
    // Fallback: check if we can read it as text (unlikely for PDF)
    process.exit(1);
}

console.log(`[Verify] Extraction Complete. Length: ${text.length} chars`);
fs.writeFileSync('debug_invoice_text.txt', text);
console.log(`[Verify] Saved full text to debug_invoice_text.txt`);

// 2. Run Logic
console.log(`[Verify] Running nicolazziInvoiceTableExtraction...`);
const result = extractNicolazziInvoiceTable(text);

// 3. Output
console.log(JSON.stringify(result, null, 2));

// 4. Basic Assertions
if (result.lines.length === 0) console.error("❌ FAILURE: No lines found!");
else console.log(`✅ SUCCESS: Found ${result.lines.length} lines.`);

if (!result.totals.total) console.error("❌ FAILURE: No Total found!");
else console.log(`✅ SUCCESS: Total ${result.totals.total}`);
