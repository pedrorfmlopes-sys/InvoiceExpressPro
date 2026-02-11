const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const FILE_PATH = path.join(__dirname, '../audit_json_results_poppler/poppler_proforma_085.pdf.json');
// Warning: I need a PDF, not JSON. Let's look for a PDF in the repo or allow user to provide one.
// Actually I see 'poppler_proforma_085.pdf' mentioned in context but maybe not the file itself.
// I will check the 'audit_materials' or similar if exists, or use the 'nicolazziProformaTableExtraction.js' test file if I can find one.
// Wait, I can try to use an existing doc ID if I can list them.

async function run() {
    try {
        console.log("1. Listing Docs to find a Proforma...");
        const listRes = await axios.get(`${BASE_URL}/api/docs?limit=20`);
        const docs = listRes.data.rows || [];

        let targetDoc = docs.find(d => d.origName && d.origName.includes('085') && d.origName.toLowerCase().endsWith('.pdf'));

        if (!targetDoc) {
            console.log("No suitable doc found in recent list. Uploading one...");
            // If I can't find a PDF to upload, I'm stuck.
            // But wait, the context shows: Active Document: .../poppler_proforma_085.pdf.json
            // Maybe the PDF is nearby?
            // Let's assume there is a PDF at c:\Users\pedro\OneDrive\APPS\GitHub\InvoiceStudioGRVTY-main\data\staging\ or similar?
            // Safer: Just call extract on an existing ID if found.
            if (docs.length > 0) {
                targetDoc = docs[0];
                console.log(`Using generic doc ${targetDoc.id} (${targetDoc.origName}) for connectivity test.`);
            } else {
                console.error("No docs in system.");
                return;
            }
        } else {
            console.log(`Found target doc: ${targetDoc.id} (${targetDoc.origName})`);
        }

        console.log(`2. Triggering V2 Extraction for ${targetDoc.id}...`);
        const extractRes = await axios.post(`${BASE_URL}/api/docs/extract`, { docIds: [targetDoc.id] });

        console.log("3. Result:");
        const resDoc = extractRes.data.results[0].row;
        // console.log(JSON.stringify(resDoc, null, 2));

        if (resDoc.docType === 'proforma' && typeof resDoc.supplier === 'object') {
            console.log("SUCCESS: Engine connected! (Got 'proforma' and Object supplier)");
        } else {
            console.log("FAILURE: Engine disconnected.");
            console.log(`Got docType: '${resDoc.docType}' (Expected 'proforma')`);
            console.log(`Got supplier type: '${typeof resDoc.supplier}' (Expected 'object')`);
        }

    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.error(e.response.data);
    }
}

run();
