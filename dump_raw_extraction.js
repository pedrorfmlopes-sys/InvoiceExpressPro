const fs = require('fs');
const path = require('path');
process.env.PDFTOTEXT_PATH = 'C:/Users/pedro/OneDrive/APPS/poppler-25.12.0/Library/bin/pdftotext.exe';
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');

async function dumpRaw() {
    const files = [
        'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/085.pdf',
        'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/144.pdf',
        'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/145.pdf',
        'C:/Users/pedro/OneDrive - DIVITEK/A-Divitek - Divitek/04 - OFFICINA NICOLAZZI/Faturas 2025/Proformas/2631.pdf'
    ];

    for (const file of files) {
        console.log(`\n=== RAW TEXT: ${path.basename(file)} ===\n`);
        const buffer = fs.readFileSync(file);
        const text = pdfBufferToTextPoppler(buffer);
        console.log(text);
        console.log('--- END ---');
    }
}

dumpRaw().catch(console.error);
