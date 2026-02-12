
const fs = require('fs');
const pdf = require('pdf-parse');

const filePath = 'c:\\Users\\pedro\\OneDrive\\APPS\\GitHub\\InvoiceStudioGRVTY-main\\test_pagination.pdf';

async function verifyPdf() {
    try {
        if (!fs.existsSync(filePath)) {
            console.error("❌ File not found:", filePath);
            return;
        }

        const dataBuffer = fs.readFileSync(filePath);

        const data = await pdf(dataBuffer);

        console.log(`✅ PDF Loaded. Pages: ${data.numpages}`);
        console.log(`✅ Text Length: ${data.text.length} chars`);

        // Check for specific tokens
        const hasPagination = data.text.includes('Pág 1 /') || data.text.includes('Pág 1/');
        const headerCount = (data.text.match(/Codigo\s+Qtd\s+Descrição/g) || []).length;
        const hasTotals = data.text.includes('Total (c/IVA)');

        console.log(`--- Verification Report ---`);
        console.log(`Pagination Detected: ${hasPagination ? 'YES' : 'NO'}`);
        console.log(`Header Repetitions: ${headerCount} (Should be >= 1)`);
        console.log(`Totals Detected: ${hasTotals ? 'YES' : 'NO'}`);

        console.log(`\n--- First 500 chars ---`);
        console.log(data.text.substring(0, 500));

        console.log(`\n--- Last 500 chars ---`);
        console.log(data.text.substring(data.text.length - 500));

    } catch (e) {
        console.error("Error parsing PDF:", e);
    }
}

verifyPdf();
