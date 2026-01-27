const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const engine = require('../server/src/engine/engine');

// Set Poppler Path as per environment
process.env.PDFTOTEXT_PATH = "C:\\Users\\pedro\\OneDrive\\APPS\\poppler-25.12.0\\Library\\bin\\pdftotext.exe";

const TARGETS = [
    {
        key: '038B',
        path: 'data/projects/default/staging/1769368594640_038B.pdf',
        expectedExtractor: 'nicolazziInvoiceCoordsExtraction',
        desc: 'Nicolazzi Invoice - Dirty PDF (Scanning Grid)'
    },
    {
        key: '049B',
        path: 'data/projects/default/staging/1769273401474_049B.pdf',
        expectedExtractor: 'nicolazziInvoiceCoordsExtraction',
        desc: 'Nicolazzi Invoice - Clean PDF'
    },
    {
        key: '212',
        path: 'data/projects/default/staging/1769270512627_212.pdf',
        expectedExtractor: undefined, // Should NOT be Coords
        desc: 'Nicolazzi Proforma (Should use Legacy/RegEx)'
    },
    {
        key: 'BUTO',
        path: 'data/projects/default/staging/1769273401118_Factura_INT-0095_BUTO.pdf',
        expectedExtractor: undefined, // Should NOT be Coords
        desc: 'BUTO Invoice'
    }
];

async function runVerification() {
    console.log("=== FINAL VERIFICATION SUITE ===");
    console.log("Poppler Path:", process.env.PDFTOTEXT_PATH);

    for (const t of TARGETS) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Processing: ${t.key} (${t.desc})`);
        console.log(`Path: ${t.path}`);

        try {
            const absPath = path.resolve(t.path);
            if (!fs.existsSync(absPath)) {
                console.error("FILE NOT FOUND:", absPath);
                continue;
            }

            const buffer = fs.readFileSync(absPath);
            const data = await pdf(buffer);
            const text = data.text;

            console.log("Text Length:", text.length);

            const result = await engine.process(text, buffer);

            console.log("DocType:", result.docType);
            console.log("Extractor Debug:", result.debug ? result.debug.extractor : 'N/A');
            console.log("DocNumber:", result.docNumber);
            console.log("Date:", result.dates ? result.dates.issued : 'N/A');
            console.log("Entities Customer:", result.entities && result.entities.customer ? result.entities.customer.name : 'N/A');
            console.log("Entities Supplier:", result.entities && result.entities.supplier ? result.entities.supplier.name : 'N/A');
            console.log("Totals:", JSON.stringify(result.totals));
            console.log("Line Count:", result.lines ? result.lines.length : 0);

            if (result.lines && result.lines.length > 0) {
                console.log("First Line:", JSON.stringify(result.lines[0]));
                console.log("Last Line:", JSON.stringify(result.lines[result.lines.length - 1]));
            }

            // Checks
            if (t.expectedExtractor) {
                if (result.debug && result.debug.extractor === t.expectedExtractor) {
                    console.log("PASS: Extractor matches expected.");
                } else {
                    console.error(`FAIL: Expected extractor ${t.expectedExtractor}, got ${result.debug ? result.debug.extractor : 'unknown'}`);
                }
            } else {
                if (result.debug && result.debug.extractor === 'nicolazziInvoiceCoordsExtraction') {
                    console.error("FAIL: Extractor should NOT be Coords for this file.");
                } else {
                    console.log("PASS: Extractor correctly fell back to text-based.");
                }
            }

        } catch (e) {
            console.error("CRASH processing " + t.key, e);
        }
    }
}

runVerification();
