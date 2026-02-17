
const nicolazziExt = require('../server/src/engine/nicolazziProformaTableExtraction');

// Text simulating the issue where "Spett.le" might be followed by garbage or layout artifacts
const sampleText = `
OFFICINA NICOLAZZI s.p.a.
Via Pietro Durio 119
Delivery Address
GRESIT LDA
RUA DAS DEVESAS N.118
SEROA, PACOS DE FERREIRA 4595-069

Spett.le -fo DVTKB, LDA
RUA DAS DEVESAS N.118
PACOS DE FERREIRA 4595-069
Portogallo

PROFORMA INVOICE
Number Date Pag.
25/01412 01/07/2025 1

Payment Condition
60 DAYS BANK TRANSFER

Vat Number
515834807
Phone Fax
+351255892311
`;

console.log("--- TESTING NICOLAZZI NAME EXTRACTION ---");
const result = nicolazziExt(sampleText);

console.log("Customer extracted:", result?.entities?.customer);
const name = result?.entities?.customer?.name;

if (name && (name.startsWith('-') || name.includes('-fo'))) {
    console.log("❌ VERDICT: Name is POLLUTED:", name);
} else {
    console.log("✅ VERDICT: Name is CLEAN:", name);
}
