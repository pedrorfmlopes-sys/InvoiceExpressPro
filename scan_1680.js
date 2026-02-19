const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/extractors/nicolazzi_invoices.sqlite');
console.log("DB Path:", dbPath);
const db = new sqlite3.Database(dbPath);

console.log("=== SCANNING FOR 001680/B ===");

db.serialize(() => {
    db.all("SELECT docId, dataJson FROM extractions", (err, rows) => {
        if (err) { console.error("DB Error:", err); return; }

        rows.forEach(r => {
            try {
                const data = JSON.parse(r.dataJson);
                // Look for 001680/B in docNumber OR inside source info
                const num = data.docNumber || "N/A";

                if (num.includes("1680")) {
                    console.log("\nFOUND IT! DocId:", r.docId, " DocNum:", num);
                    console.log("--- Extracted Payload ---");
                    console.log(JSON.stringify(data, null, 2));
                    console.log("-------------------------\n");
                } else {
                    console.log("Skipping DocId:", r.docId, " DocNum:", num);
                }
            } catch (e) {
                console.log("Parse Error for DocId:", r.docId);
            }
        });
    });
});

db.close();
