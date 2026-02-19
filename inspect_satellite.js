const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const docId = '91c9061a-fc4f-4d03-858b-511013aab172';
const dbPath = path.resolve(__dirname, 'server/data/extractors/nicolazzi_invoices.sqlite');

console.log('Checking Satellite DB:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.log('Satellite DB file not found!');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

db.serialize(() => {
    db.get(`SELECT dataJson FROM extractions WHERE docId = ?`, [docId], (err, row) => {
        if (err) {
            console.error('Query error:', err.message);
            return;
        }

        if (row) {
            console.log('Found record in Satellite DB.');
            try {
                const data = JSON.parse(row.dataJson);
                console.log('Shipping Marks:', data.shippingMarks);
                console.log('Project Ref:', data.projectRef || (data.docRefs && data.docRefs[0]));
                console.log('Full Data Keys:', Object.keys(data).join(', '));
            } catch (e) {
                console.error('JSON Parse Error:', e.message);
            }
        } else {
            console.log('No record found in Satellite DB for this ID.');
        }
    });
});

db.close();
