const extractNicolazziInvoiceTable = require('../server/src/engine/nicolazziInvoiceTableExtraction');

// Text from User's Debug JSON
const TEXT = `NICOLAZZI s.p.a.
28010 ALZO (NO) - Via P. Durio, 119
tel. (0322) 969.672 r.a.
Telefax (0322) 969.532
C.C.I.A.A. n. 84286-M. NO 001005
Part. IVA e Cod. Fiscale: 00115930034
Isc. Trib. Verbania Reg. Soc. n: 3398
Capitale Sociale € 1.800.000,00 i.v.
SANIMAIA MAT.CONSTR.DECOR.UNIP.LDA
RUA DA INDUSTRIA 2891
4785-627TROFA
INVOICE
1
Invoice
Privacy information available on www.nicolazzi.it
Pag.
000027/B
Numero/ Number
10/01/2025
Data/ Date
030SA180
Codice Cliente
Banca di appoggio
30 DAYS BANK TRANSFER
Condizione pagamento /Payment
NEM
Agente
EX DESTINATION
Porto
GOODS OF ITALIAN ORIGIN
Annotazioni
AS ADDRESS
Riferimento / Shipping Marks
REF. YOUR P.O.
vsrife
PT502952113
P.IVAVolume
1
Colli / Cases
3,00
Peso lordo/ Gross W. Kg.
2,50
Peso Netto/Net W. Kg.
ArticleYour ArticleDescription UMQuantity CurrencyUnit ValueAMOUNT IVAPosition
DDT Nr. 000046 del 10/01/2025
3851
5542GO GEBERIT "BRASS" WC FLUSH PLATENR1EUR691,90691,90NI410
691,90
WE DECLARE THAT GOODS BEING EXPORTED ARE NOT:
DUAL USE PRODU`;

console.log("[Repro] Running Extraction on Compressed Text...");
const result = extractNicolazziInvoiceTable(TEXT);

console.log(JSON.stringify(result, null, 2));

if (result.lines.length === 0) console.error("❌ FAILURE: No lines found!");
else console.log(`✅ SUCCESS: Found ${result.lines.length} lines.`);

// Diagnosis
if (result.lines.length === 0) {
    console.log("\n[Repro] Analyzing specific failure line:");
    const targetLine = '5542GO GEBERIT "BRASS" WC FLUSH PLATENR1EUR691,90691,90NI410';
    console.log(`Target: ${targetLine}`);
    // Current Regex test
    const money = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
    const endRegex = new RegExp(`(${money})\\s+(${money})(?:\\s+([A-Z0-9]+))?$`);
    console.log(`Regex Match:`, targetLine.match(endRegex));
}
