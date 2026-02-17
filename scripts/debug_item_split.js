
const nicolazziExt = require('../server/src/engine/nicolazziProformaTableExtraction');

// Simulated input from user screenshot
// Row 2: " - \t - 1486INFV Towel holder cm.60 AGORA \t 6 \t 261 \t 50+5 \t 743.85"
const sampleText = `
Pos Article Description Quantity Unit Value Discount Amount
-
- 1486INFV Towel holder cm.60 AGORA 6 261,00 50+5 743,85
`;

console.log("--- DEBUGGING ITEM SPLITTING ---");
const result = nicolazziExt(sampleText);

console.log("Extracted Lines:", JSON.stringify(result.lines, null, 2));

const line = result.lines[0];
if (line) {
    if (line.code === '1486INFV') {
        console.log("✅ SUCCESS: Code extracted correctly.");
    } else {
        console.log("❌ FAIL: Code NOT extracted. Code:", line.code, "Description:", line.description);
    }
} else {
    console.log("❌ FAIL: No line extracted.");
}
