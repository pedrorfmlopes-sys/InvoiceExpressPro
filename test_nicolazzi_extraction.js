const extractNicolazziInvoiceTable = require('./server/src/engine/nicolazziInvoiceTableExtraction');

const sampleText = `
NICOLAZZI S.p.A.
Via P. Durio 119
Invoice Numero/ Number: 12345/A
Data/ Date: 19/02/2026
Vostro Riferimento: PROJECT_ALPHA_123
Shipping Marks: MARK_BETA_456
Articolo/Item  Descrizione/Description  Ord. Ref  Qta  Unit Price  Total
SKU001         TEST PRODUCT 1          REF001    10   100,00      1.000,00 EUR
SKU002         TEST PRODUCT 2          REF002    5    200,00      1.000,00 EUR
In relazione al presente documento assumendo agli effetti
delle vigenti disposizioni piena e direta responsabilita'
Totale EUR 2.000,00
`;

const result = extractNicolazziInvoiceTable(sampleText);
console.log("--- EXTRACTION RESULT ---");
console.log("Document Number:", result.docNumber);
console.log("Date Issued:", result.dates.issued);
console.log("Project Ref:", result.projectRef);
console.log("Shipping Marks:", result.shippingMarks);
console.log("Lines Count:", result.lines.length);
if (result.lines.length > 0) {
    console.log("First Line SKU:", result.lines[0].code);
    console.log("First Line Desc:", result.lines[0].description);
}
console.log("Total Gross:", result.totals.gross);
console.log("--- END ---");
