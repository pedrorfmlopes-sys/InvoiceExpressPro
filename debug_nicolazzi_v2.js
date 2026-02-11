const MasterEngine = require('./server/src/engine/engine');
const classify = require('./server/src/engine/classifyDocType');
const fs = require('fs');
const path = require('path');

const sampleText = `
NICOLAZZI s.p.a. 
PROFORMA INVOICE
Number 123/2026 Date 11/02/2026
Spett.le Cliente Mario Rossi
Fattura Proforma nº 456/26
Total 1234,56
`;

async function test() {
    console.log("--- TEST CLASSIFY ---");
    const docTypeClass = classify(sampleText);
    console.log("Classify Result:", docTypeClass);

    console.log("\n--- TEST MASTER ENGINE ---");
    const engineResult = await MasterEngine.process(sampleText, null);
    console.log("Engine Result DocType:", engineResult.docType);
    console.log("Engine Result Number:", engineResult.docNumber);
}

test().catch(console.error);
