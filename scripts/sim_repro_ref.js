const extractNicolazziInvoiceTable = require('../server/src/engine/nicolazziInvoiceTableExtraction');

const textSample = `NICOLAZZI s.p.a.
28010 ALZO (NO) - Via P. Durio, 119
  IT 00115930034
SANIMAIA MAT.CONSTR.DECOR.UNIP.LDA
tel. (0322) 969.672 r.a.
Telefax (0322) 969.532
C.C.I.A.A. n. 84286-M. NO 001005
Part. IVA e Cod. Fiscale:
Isc. Trib. Verbania Reg. Soc. n: 3398
Capitale Sociale € 1.800.000,00 i.v.
RUA DA INDUSTRIA 2891
4785-627TROFA
Portogallo
1
Fattura
INVOICE
Pag.
Privacy information available on www.nicolazzi.it
000049/B
Numero/ Number
15/01/2025
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
24/02678
riferimento/Shipping Marks
ARQ.JOANA POSAS
Vostro Riferimento
PT502952113
P.IVA
0,00
Volume
6
Colli / Cases
105,00
Peso lordo/ Gross W. Kg.
97,00
Peso Netto / Net W. Kg.
ArticoloCol.DescrizioneOrd. Ref.UMQuantitàDivisaValore unitarioSconti/AumentiIMPORTOIVA
DDT Nr. 000085 del 15/01/2025
5107EXTGFB2EXTERNAL PART WASH BASIN WALL MOUNTED ARQ.JOANA POSASNR1EUR390,00390,00NI41
2`;

console.log("--- START EXTRACTION ---");
const result = extractNicolazziInvoiceTable(textSample);
console.log("--- RESULT ---");
console.log(JSON.stringify(result, null, 2));

if (result.projectRef === 'ARQ.JOANA POSAS') {
    console.log("✅ SUCCESS: Found projectRef");
} else {
    console.log("❌ FAILURE: projectRef is", result.projectRef);
}
