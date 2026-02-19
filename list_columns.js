const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/db.sqlite');
console.log("DB Path:", dbPath);
const db = new sqlite3.Database(dbPath);

console.log("=== LIST COLUMNS in documents ===");
db.serialize(() => {
    db.all("PRAGMA table_info(documents)", (err, rows) => {
        if (err) { console.error("DB Error:", err); return; }
        rows.forEach(r => console.log(r.name));
    });
});
db.close();
