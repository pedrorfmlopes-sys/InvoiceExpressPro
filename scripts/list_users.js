const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/db.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT email, role, name FROM users JOIN memberships ON users.id = memberships.userId", [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.table(rows);
    }
    db.close();
});
