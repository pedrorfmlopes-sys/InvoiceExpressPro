const fs = require('fs');
const path = require('path');
const Engine = require('../server/src/engine/engine');

const testFile = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/015.pdf';

async function verifyStep1() {
    console.log('Verifying Step 1: Engine.js Poppler Integration...');

    if (!fs.existsSync(testFile)) {
        console.error('Test file not found!');
        return;
    }

    const buffer = fs.readFileSync(testFile);

    // Simulate controller call with "bad"/minimal text
    const badText = 'NICOLAZZI s.p.a. This is a minimal text that normally fails regex extraction.';

    console.log('Calling Engine.process with minimal text and PDF buffer...');
    const result = await Engine.process(badText, buffer);

    console.log('\n--- Extraction Results ---');
    console.log('Doc Type:', result.docType);
    console.log('Doc Number:', result.docNumber);
    console.log('Lines Found:', result.lines.length);
    console.log('Total:', result.totals.total);
    console.log('Confidence:', result.confidence);

    if (result.docNumber === '26/00015' && result.lines.length > 0) {
        console.log('\nSUCCESS: Step 1 verified. Engine.js is using Poppler for re-extraction.');
    } else {
        console.error('\nFAILURE: Step 1 failed. Data not extracted correctly.');
    }
}

verifyStep1().catch(console.error);
