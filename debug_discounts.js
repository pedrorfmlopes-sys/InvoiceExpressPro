const MasterEngine = require('./server/src/engine/engine');
const fs = require('fs');

const mockText = `
NICOLAZZI s.p.a.
PROFORMA INVOICE 26/08888 Date 11/02/2026

Pos          Article       Col                                                       Description                             Quantity       Unit Value         Discount             Amount
 1   1430OL                    MONOCOMANDO LAVELLO                                                                            1            579,00               10              521,10
 2   2206OL27                  MONOFORO LAVELLO                                                                               1            348,00             10+5              297,54
 3   5554OL                    PILETTA BASKET                                                                                 4            158,00                               632,00

TOTAL AMOUNT                                                                                                                                                                 1450,64
`;

async function testDiscounts() {
    console.log("[Diagnostic] Running Master Engine with mock discount data...");
    const result = await MasterEngine.process(mockText, null);

    console.log("\n--- EXTRACTION RESULTS ---");
    result.lines.forEach(l => {
        console.log(`Code: ${l.code} | Qty: ${l.quantity} | Unit: ${l.unitPrice} | Disc: ${l.discountText} | Total: ${l.total}`);
    });

    const expectedTotal = 1450.64;
    console.log(`\nDoc Total: ${result.totals.total} (Expected: ${expectedTotal})`);
}

testDiscounts().catch(console.error);
