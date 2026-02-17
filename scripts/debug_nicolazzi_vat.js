
const nicolazziExt = require('../server/src/engine/nicolazziProformaTableExtraction');

const sampleText = `
OFFICINA NICOLAZZI s.p.a.
Via Pietro Durio 119
Delivery Address
GRESIT LDA
RUA DAS DEVESAS N.118
SEROA, PACOS DE FERREIRA 4595-069

Spett.le 030GR063
GRESIT, LDA
RUA DAS DEVESAS N.118
PACOS DE FERREIRA 4595-069
Portogallo

PROFORMA INVOICE
Number Date Pag.
25/01412 01/07/2025 1

Payment Condition
60 DAYS BANK TRANSFER

Vat Number
514494166
Phone Fax
+351255892311

Pos Article Col Description Quantity Unit Value Discount Amount
`;

console.log("--- TESTING NICOLAZZI VAT EXTRACTION ---");
const result = nicolazziExt(sampleText);

console.log("Customer extracted:", result?.entities?.customer);
console.log("VAT extracted:", result?.entities?.customer?.vat);

const vat = result?.entities?.customer?.vat;
const hasValidNif = vat && /^(PT)?\d{9}$/.test(vat.replace(/\s/g, ''));

console.log("Smart Check Passes?", hasValidNif);
