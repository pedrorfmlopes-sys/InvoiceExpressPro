const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname);
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const SERVER_ENTRY = path.join(ROOT_DIR, 'server/src/index.js');

console.log('[Launcher] Starting Invoice Studio...');

// 1. Start Backend
const server = spawn('node', [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000', AUTH_MODE: 'optional' } // Force optional auth for easy access
});

server.on('error', (err) => console.error('[Server] Failed to start:', err));

// 2. Start Frontend
const client = spawn('npm', ['run', 'dev'], {
    cwd: CLIENT_DIR,
    stdio: 'inherit',
    env: { ...process.env },
    shell: true
});

client.on('error', (err) => console.error('[Client] Failed to start:', err));

console.log('[Launcher] Services starting...');
console.log('Backend: http://localhost:3000');
console.log('Frontend: http://localhost:5173');
