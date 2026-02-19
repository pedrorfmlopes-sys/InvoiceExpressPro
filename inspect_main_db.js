const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/db.sqlite');
console.log("DB Path:", dbPath);
const db = new sqlite3.Database(dbPath);

console.log("=== SCANNING Documents in Main DB for 1680 or 1680-B ===");

db.serialize(() => {
    // Select dossierName and rawJson
    db.all("SELECT id, dossierName, rawJson FROM documents", (err, rows) => {
        if (err) { console.error("DB Error:", err); return; }

        if (!rows) {
            console.log("No rows in documents.");
            return;
        }

        let found = false;
        rows.forEach(r => {
            const name = r.dossierName || "";
            const jsonText = r.rawJson || "{}";

            // Heuristic check
            const check = jsonText.includes("001680") || name.includes("1680");

            if (check) {
                found = true;
                console.log("\nFOUND IT! DocId:", r.id, " Dossier:", name);
                try {
                    const data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
                    console.log("--- Extracted Payload ---");
                    console.log(JSON.stringify(data.entities?.customer, null, 2));
                    console.log("Shipping Marks:", data.shippingMarks);
                    console.log("Project Ref:", data.projectRef);
                    console.log("-------------------------\n");
                } catch (e) {
                    console.log("Error Parsing JSON for", r.id);
                }
            }
        });

        if (!found) console.log("No document matched 1680.");
    });
});
db.close();
