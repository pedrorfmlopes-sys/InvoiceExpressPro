require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extract = require('./server/src/engine/nicolazziInvoiceTableExtraction');

async function debugFinal() {
    const filePath = path.join(__dirname, 'TMP', '339b.pdf');
    const text = await pdfBufferToTextPoppler(fs.readFileSync(filePath));
    const res = extract(text);

    console.log("DOC:", res.docNumber);
    console.log("PROJ REF:", res.projectRef);
    console.log("LINE 1 REF:", res.lines[0].projectRef);
    console.log("SHIP TO ADDR:", res.entities.shipping.address);
    console.log("BILL TO ADDR:", res.entities.customer.address);
}

debugFinal();
