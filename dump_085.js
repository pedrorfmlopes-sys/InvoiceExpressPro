
const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');

async function dump() {
    const file = 'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/085.pdf';
    const buf = fs.readFileSync(file);
    const text = await pdfBufferToTextPoppler(buf);
    console.log("=== RAW TEXT: 085.pdf ===");
    console.log(text);
    console.log("=== END ===");
}

dump().catch(console.error);
