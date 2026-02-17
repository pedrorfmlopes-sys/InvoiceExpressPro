const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/extractors/nicolazziproformas.sqlite');
const DOC_ID = '2549123b-b91d-4ab6-8bde-d6691918cf99'; // Retrieved from previous step

console.log(`[DEBUG] Opening Satellite DB: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error("Error opening DB:", err.message);
        return;
    }
    console.log("Connected to Satellite DB.");
});

db.get(`SELECT * FROM extractions WHERE docId = ?`, [DOC_ID], (err, row) => {
    if (err) {
        console.error(err.message);
        return;
    }
    if (row) {
        console.log("\n[SATELLITE FOUND]");
        console.log("Updated At:", row.updatedAt);
        try {
            const data = JSON.parse(row.dataJson);
            console.log("ShipTo Address:", JSON.stringify(data?.entities?.shipTo, null, 2));
        } catch (e) {
            console.error("Error parsing JSON:", e);
        }
    } else {
        console.log("\n[SATELLITE NOT FOUND] No draft exists for this document.");
    }
});

db.close();
