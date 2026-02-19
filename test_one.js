require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extractNicolazzi = require('./server/src/engine/nicolazziInvoiceTableExtraction_LAB');

async function testOne() {
    const file = '339b.pdf';
    const filePath = path.join(__dirname, 'TMP', file);

    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        return;
    }

    const dataBuffer = fs.readFileSync(filePath);

    console.log("=== RUNNING REAL POPPLER ENGINE ===");
    try {
        const rawText = pdfBufferToTextPoppler(dataBuffer);

        console.log("=== TXT START (REAL LAYOUT) ===");
        console.log(rawText);
        console.log("=== TXT END ===");

        const result = extractNicolazzi(rawText);
        console.log("REAL RESULT (OFFICIAL EXTRACTOR):", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Critical Error during Poppler execution:", err.message);
    }
}

testOne();
