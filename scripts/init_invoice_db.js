const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'extractors', 'nicolazzi_invoices.sqlite');

console.log(`[InitDB] Path: ${DB_PATH}`);

// Ensure dir exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    console.log("[InitDB] Checking schema...");

    // Create Table
    db.run(`
        CREATE TABLE IF NOT EXISTS extractions (
            docId TEXT PRIMARY KEY,
            dataJson TEXT,
            createdAt INTEGER,
            updatedAt INTEGER
        )
    `, (err) => {
        if (err) {
            console.error("[InitDB] Failed to create table:", err);
            process.exit(1);
        } else {
            console.log("[InitDB] Table 'extractions' verified/created.");
        }
    });

    // Verify
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) console.error(err);
        else console.log("[InitDB] Tables:", rows);
        db.close();
    });
});
