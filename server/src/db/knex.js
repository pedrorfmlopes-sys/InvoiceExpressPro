const path = require('path');
const { PATHS } = require('../config/constants');
const fs = require('fs');

const client = (process.env.DB_CLIENT || 'sqlite3').trim();
const isSqlite = client === 'sqlite3';

if (isSqlite) {
    const dataDir = path.join(process.cwd(), 'data'); // Ensure data dir exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

const config = {
    client,
    connection: isSqlite ? {
        filename: path.join(process.cwd(), 'data/db.sqlite')
    } : process.env.DATABASE_URL,
    useNullAsDefault: true,
    migrations: {
        directory: path.join(__dirname, 'migrations')
    }
};

console.log(`[DB] Using ${isSqlite ? 'sqlite' : 'postgres'}`);

const knex = require('knex')(config);

module.exports = knex;
