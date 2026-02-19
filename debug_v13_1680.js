const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extractNicolazzi = require('./server/src/engine/nicolazziInvoiceTableExtraction');

async function debug1680() {
    process.env.PDFTOTEXT_PATH = "C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe";
    console.log("=== DEBUGGING V13 EXTRACTION (1680-B) ===");
    console.log("Using Poppler:", process.env.PDFTOTEXT_PATH);
    const file = path.resolve(__dirname, 'TMP/1680-B.pdf');

    if (!fs.existsSync(file)) {
        console.error("PDF not found:", file);
        return;
    }

    try {
        const text = await pdfBufferToTextPoppler(fs.readFileSync(file));
        const data = extractNicolazzi(text);

        console.log("CUSTOMER NAME:", data.entities?.customer?.name);
        console.log("CUSTOMER ADDRESS:", data.entities?.customer?.address);
        console.log("DATE:", data.dates?.issued);
        console.log("SHIPPING MARKS:", data.shippingMarks);
        console.log("PROJECT REF:", data.projectRef);

    } catch (e) {
        console.error("Error:", e);
    }
}

debug1680();
