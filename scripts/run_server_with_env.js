// scripts/run_server_with_env.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Defaults ---
const DEFAULTS = {
    DB_CLIENT: 'sqlite',
    AUTH_MODE: 'required',
    QA_MODE: 'true',
    PORT: '3000',
    NODE_ENV: 'development'
};

// --- Helper: Detect SQLite File ---
const detectSqlite = () => {
    const candidates = [
        process.env.SQLITE_FILENAME,
        'db/database.sqlite',
        'database.sqlite'
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(path.resolve(c))) {
            return c;
        }
    }
    return 'db/database.sqlite';
};

// --- Prepare Env ---
const env = { ...process.env };
let envChanges = [];

Object.keys(DEFAULTS).forEach(key => {
    if (!env[key]) {
        env[key] = DEFAULTS[key];
        envChanges.push(`${key}=${DEFAULTS[key]}`);
    }
});

if (!env.SQLITE_FILENAME && env.DB_CLIENT === 'sqlite') {
    const dbFile = detectSqlite();
    env.SQLITE_FILENAME = dbFile;
    envChanges.push(`SQLITE_FILENAME=${dbFile}`);
}

console.log('--- [Run Server with Env] ---');
if (envChanges.length > 0) {
    console.log('Applied Defaults:');
    envChanges.forEach(c => console.log(`  + ${c}`));
} else {
    console.log('Using existing environment variables.');
}

// --- Run Server ---
// Target: server/src/index.js
const serverEntry = path.join('server', 'src', 'index.js');
console.log(`Starting: node ${serverEntry} ...`);
console.log('-----------------------------');

const child = spawn('node', [serverEntry], {
    stdio: 'inherit',
    env: env
});

child.on('close', (code) => {
    console.log(`[Server] Exited with code ${code}`);
    process.exit(code);
});
