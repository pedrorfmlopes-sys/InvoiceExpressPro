const path = require('path');
const fs = require('fs');

// Environment processing
const rawClient = (process.env.DB_CLIENT || '').trim().toLowerCase();
const dbUrl = (process.env.DATABASE_URL || '').trim();
let sqliteFilename = (process.env.SQLITE_FILENAME || '').trim();

let config = {};
let activeClient = '';

// Helper to redact URL for logs
const redact = (url) => url.replace(/:[^:@]+@/, ':****@');

// 1. Strict Selection
if (['pg', 'postgres', 'postgresql'].includes(rawClient)) {
    if (!dbUrl) {
        console.error('[DB] CRITICAL: DB_CLIENT is set to postgres but DATABASE_URL is missing.');
        process.exit(1);
    }

    activeClient = 'pg';
    config = {
        client: 'pg',
        connection: dbUrl,
        migrations: { directory: path.join(__dirname, 'migrations') },
        useNullAsDefault: true,
        pool: { min: 2, max: 10 } // Reasonable defaults for PG
    };
    console.log(`[DB] Using POSTGRESQL (${redact(dbUrl)})`);

} else if (['sqlite', 'sqlite3'].includes(rawClient) || rawClient === '') {
    // Default to sqlite if empty or explicit
    activeClient = 'sqlite3';

    // Resolve filename
    if (!sqliteFilename) {
        // Safe default: ../../../../data/db.sqlite relative to this file (server/src/db/knex.js)
        // Adjust based on project structure: root/data/db.sqlite
        sqliteFilename = path.resolve(__dirname, '../../../../data/db.sqlite');
    } else {
        sqliteFilename = path.resolve(sqliteFilename);
    }

    // Ensure dir exists
    const dir = path.dirname(sqliteFilename);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            console.error(`[DB] Error creating directory for SQLite: ${dir}`, e.message);
            process.exit(1);
        }
    }

    config = {
        client: 'sqlite3',
        connection: { filename: sqliteFilename },
        migrations: { directory: path.join(__dirname, 'migrations') },
        useNullAsDefault: true,
        pool: {
            afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
        }
    };
    console.log(`[DB] Using SQLITE (${sqliteFilename})`);

} else {
    console.error(`[DB] CRITICAL: Unsupported DB_CLIENT '${rawClient}'. Use 'sqlite' or 'pg'.`);
    process.exit(1);
}

const db = require('knex')(config);

// Export
module.exports = db;
