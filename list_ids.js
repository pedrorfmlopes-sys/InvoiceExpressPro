const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/extractors/nicolazzi_invoices.sqlite');
console.log("DB Path:", dbPath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT docId FROM extractions", (err, rows) => {
        if (err) {
            console.error("DB Error:", err);
            return;
        }
        console.log("=== DOC IDs IN DB ===");
        rows.forEach(r => console.log(r.docId));
    });
});

db.close();
