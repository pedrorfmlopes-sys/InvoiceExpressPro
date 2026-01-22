// scripts/kill_port.js
const { execSync } = require('child_process');

const PORT = process.argv[2];

if (!PORT) {
    console.error('Usage: node scripts/kill_port.js <PORT>');
    process.exit(1);
}

const isWin = process.platform === 'win32';

console.log(`[KillPort] Searching for processes on port ${PORT}...`);

try {
    if (isWin) {
        // Windows: netstat -> findstr -> taskkill
        // netstat -ano | findstr :<PORT>
        try {
            const output = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const lines = output.trim().split('\n');
            const pids = new Set();

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1]; // PID is last column
                if (pid && /^\d+$/.test(pid) && pid !== '0') {
                    pids.add(pid);
                }
            });

            if (pids.size === 0) {
                console.log('[KillPort] No process found.');
            } else {
                pids.forEach(pid => {
                    console.log(`[KillPort] Killing PID ${pid}...`);
                    try {
                        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                        console.log(`[KillPort] Killed PID ${pid}.`);
                    } catch (e) {
                        console.warn(`[KillPort] Failed to kill PID ${pid}: ${e.message}`);
                    }
                });
            }
        } catch (e) {
            // findstr returns 1 if no match found, execSync throws
            console.log('[KillPort] No process found (netstat clean).');
        }

    } else {
        // Unix/Linux/Mac: lsof -ti :<PORT> | xargs kill -9
        try {
            const pids = execSync(`lsof -ti :${PORT}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            if (pids) {
                const pidList = pids.split('\n');
                pidList.forEach(pid => {
                    console.log(`[KillPort] Killing PID ${pid}...`);
                    execSync(`kill -9 ${pid}`);
                });
                console.log(`[KillPort] Killed ${pidList.length} process(es).`);
            } else {
                console.log('[KillPort] No process found.');
            }
        } catch (e) {
            console.log('[KillPort] No process found (lsof clean).');
        }
    }
} catch (e) {
    console.error(`[KillPort] Unexpected error: ${e.message}`);
    process.exit(1);
}
