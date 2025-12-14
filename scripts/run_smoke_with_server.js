const { spawn } = require('child_process');
const http = require('http');

// Configuration
const HEALTH_URL = 'http://localhost:3000/api/health';
const MAX_RETRIES = 60; // 60 * 2s = 120s max wait
const RETRY_DELAY = 1000;

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node run_smoke_with_server.js <test-script-command> [args...]');
    process.exit(1);
}

// 1. Start Server
console.log('[Runner] Starting server...');
const isWin = process.platform === 'win32';
const server = spawn('npm', ['start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000' },
    shell: true // Important for Windows to find npm
});

let serverKilled = false;

const cleanup = () => {
    if (serverKilled) return;
    console.log('[Runner] Stopping server...');
    serverKilled = true;

    // Kill the process tree (more reliable on Windows)
    if (/^win/.test(process.platform)) {
        spawn('taskkill', ['/pid', server.pid, '/f', '/t']);
    } else {
        server.kill('SIGTERM');
    }
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });

// 2. Wait for Health
const checkHealth = async () => {
    return new Promise((resolve) => {
        const req = http.get(HEALTH_URL, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        req.on('error', () => resolve(false));
        req.end();
    });
};

const waitForServer = async () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
        if (await checkHealth()) {
            console.log('[Runner] Server is ready!');
            return true;
        }
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        if (i % 5 === 0) console.log(`[Runner] Waiting for server... (${i}/${MAX_RETRIES})`);
    }
    return false;
};

// 3. Run Test
(async () => {
    const ready = await waitForServer();
    if (!ready) {
        console.error('[Runner] Timeout waiting for server.');
        cleanup();
        process.exit(1);
    }

    console.log(`[Runner] Running test: ${args.join(' ')}`);
    const [cmd, ...cmdArgs] = args;

    // Resolve command (node, npm, etc)
    const testProcess = spawn(cmd, cmdArgs, {
        stdio: 'inherit',
        shell: true
    });

    testProcess.on('close', (code) => {
        console.log(`[Runner] Test finished with code ${code}`);
        cleanup();
        process.exit(code);
    });

    testProcess.on('error', (err) => {
        console.error('[Runner] Failed to start test process:', err);
        cleanup();
        process.exit(1);
    });

})();
