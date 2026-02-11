const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const extractNicolazziInvoiceTable = require('../server/src/engine/nicolazziInvoiceTableExtraction');

const PDFTOTEXT_EXE = "C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe";
const TARGET_FILE = "C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Processadas/049B.pdf";
const DEBUG_TEXT_FILE = "debug_049B.txt";

console.log(`[MultiPage Audit] Analyzing: ${TARGET_FILE}`);

try {
    // 1. Extract Text
    const text = execFileSync(PDFTOTEXT_EXE, ["-layout", "-enc", "UTF-8", TARGET_FILE, "-"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });

    // Save text for manual inspection
    fs.writeFileSync(DEBUG_TEXT_FILE, text);
    console.log(`[MultiPage Audit] Saved raw text to ${DEBUG_TEXT_FILE}`);

    // 2. Run Extractor
    const result = extractNicolazziInvoiceTable(text);

    // 3. Log Results
    console.log(JSON.stringify(result, null, 2));

} catch (e) {
    console.error(`[MultiPage Audit] Error: ${e.message}`);
}
