require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pdfBufferToTextPoppler } = require('./server/src/utils/popplerText');
const extract = require('./server/src/engine/nicolazziInvoiceTableExtraction');

async function testAddress() {
    const filePath = path.join(__dirname, 'TMP', '339b.pdf');
    const text = await pdfBufferToTextPoppler(fs.readFileSync(filePath));
    const res = extract(text);

    console.log("=== CUSTOMER (BILL To) ===");
    console.log("Name: ", res.entities.customer.name);
    console.log("Addr: ", res.entities.customer.address);
    console.log("\n=== SHIPPING (SHIP To) ===");
    console.log("Addr: ", res.entities.shipping.address);
}

testAddress();
