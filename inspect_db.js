const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'server/data/db.sqlite');
console.log('Opening DB:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

const searchTerm = '%1680%';

db.serialize(() => {
    db.all(`SELECT id, docNumber, rawJson FROM documents WHERE docNumber LIKE ? OR origName LIKE ?`, [searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error('Query error:', err.message);
            return;
        }

        console.log(`Found ${rows.length} documents.`);
        rows.forEach(row => {
            console.log(`\n--- Document ID: ${row.id} ---`);
            console.log(`Doc Number: ${row.docNumber}`);
            try {
                const data = JSON.parse(row.rawJson);
                console.log('Shipping Marks:', data.shippingMarks);
                console.log('Project Ref:', data.projectRef || (data.docRefs && data.docRefs[0]));
            } catch (e) {
                console.log('Error parsing JSON:', e.message);
            }
        });
    });
});

db.close();
