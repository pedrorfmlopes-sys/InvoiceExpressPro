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

db.serialize(() => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, rows) => {
        if (err) {
            console.error('Query error:', err.message);
            return;
        }
        console.log('Tables found:', rows.map(r => r.name));

        // Se houver 'documents', mostra a estrutura
        if (rows.find(r => r.name === 'documents')) {
            db.all(`PRAGMA table_info(documents)`, [], (err, cols) => {
                console.log('Documents columns:', cols.map(c => c.name));
            });
        }
    });
});

db.close();
