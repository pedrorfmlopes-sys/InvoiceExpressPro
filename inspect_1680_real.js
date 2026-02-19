const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// CORRECT PATH
const dbPath = path.resolve(__dirname, 'data/extractors/nicolazzi_invoices.sqlite');
console.log("DB Path:", dbPath);
const db = new sqlite3.Database(dbPath);

const docId = '1680-B';

db.serialize(() => {
    // 1. Get Record
    db.get("SELECT * FROM extractions WHERE docId = ?", [docId], (err, row) => {
        if (err) {
            console.error("DB Error:", err);
            return;
        }
        if (!row) {
            console.log(`Document ${docId} not found in DB.`);
            return;
        }

        console.log("=== REAL SERVER DATA FOR 1680-B ===");
        let data;
        try {
            data = JSON.parse(row.dataJson);
        } catch (e) {
            console.log("Error parsing JSON:", e);
            console.log("Raw Content:", row.dataJson);
            return;
        }

        console.log("\n--- CUSTOMER ---");
        console.log("Name:", data.entities?.customer?.name);
        console.log("Address:", data.entities?.customer?.address);

        console.log("\n--- OTHER REFS ---");
        console.log("Shipping Marks:", data.shippingMarks);
        console.log("Project Ref:", data.projectRef);
        console.log("Order Ref:", data.orderRef);

        console.log("\n--- RAW CUSTOMER OBJECT ---");
        console.log(JSON.stringify(data.entities?.customer, null, 2));
    });
});

db.close();
