const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const service = require('../server/src/modules/extraction/service');

async function test() {
    try {
        console.log("Testing Extraction Service Isolation...");

        // 1. Create PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        page.drawText('TEST_KEYWORD', { x: 50, y: 500 });
        const pdfBytes = await pdfDoc.save();
        const buf = Buffer.from(pdfBytes);

        // 2. Call Match Profile
        console.log("Calling matchProfile...");
        const result = await service.matchProfile(buf);
        console.log("Result:", result);

        console.log("PASS: Service did not crash.");
    } catch (e) {
        console.error("FAIL:", e);
    }
    process.exit(0);
}

test();
