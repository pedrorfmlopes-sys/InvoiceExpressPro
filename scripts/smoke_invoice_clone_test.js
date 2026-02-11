const extractNicolazziInvoice = require('../server/src/engine/nicolazziInvoiceExtraction');

const mockInvoiceText = `
                        NICOLAZZI s.p.a.
                        Via Pietro Durio 119
                        28010 ALZO (NO)

INVOICE Number 25/00123 / Date 05/02/2026

Spett.le
CLIENTE TEST LDA
RUA DO TESTE 123
1234-567 LISBOA

Vat Number PT123456789

your ref. PROJ-XYZ-123

Pos Article Description Quantity Unit Value Discount Amount
1   1410CR  BASIC TAP   2   50,00     100,00
2   1410GO  GOLD TAP    1   150,00    150,00

Goods Value  Transport Charges  Total
250,00      10,00              260,00
`;

console.log("--- Running Smoke Test for Nicolazzi Invoice Clone ---");
const result = extractNicolazziInvoice(mockInvoiceText);

console.log("DocType:", result.docType);
console.log("DocNumber:", result.docNumber);
console.log("Customer:", result.entities.customer.name);
console.log("Customer Ref:", result.docRefs?.customerRef);
console.log("Lines Found:", result.lines.length);
if (result.lines.length > 0) {
    console.log("First Line:", result.lines[0]);
}
console.log("Totals:", result.totals);

if (result.docType === 'invoice' && result.lines.length === 2 && result.totals.total === 260) {
    console.log("✅ SUCCESS: Extractor Logic Validated");
} else {
    console.log("❌ FAILURE: Logic Validation Failed");
}
