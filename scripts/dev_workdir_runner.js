// scripts/dev_workdir_runner.js
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry');

const CWD = process.cwd();
const ENV = { ...process.env, FORCE_COLOR: '1' };

// Target Dir
const DEFAULT_WORKDIR = 'C:\\Dev\\InvoiceStudioDevWorkdir';
const WORKDIR_PATH = process.env.DEV_WORKDIR_PATH || DEFAULT_WORKDIR;

// OneDrive Detection
const ONEDRIVE_VARS = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'];
const IS_ONEDRIVE = ONEDRIVE_VARS.some(v => process.env[v] && CWD.includes(process.env[v])) || CWD.includes('OneDrive');

// --- Utils ---
const log = (msg, type = 'INFO') => {
    const color = type === 'ERR' ? '\x1b[31m' : (type === 'WARN' ? '\x1b[33m' : (type === 'OK' ? '\x1b[32m' : (type === 'SKIP' ? '\x1b[35m' : '\x1b[36m')));
    const reset = '\x1b[0m';
    console.log(`${color}[${type}] ${msg}${reset}`);
};

// Robust Spawn Wrapper
const runCommand = async (cmdString, cwd = WORKDIR_PATH, opts = {}) => {
    if (DRY_RUN) {
        log(`(DRY) [${cwd}] Would execute: ${cmdString}`, 'WARN');
        return;
    }

    return new Promise((resolve, reject) => {
        const parts = cmdString.trim().split(/\s+/);
        let cmd = parts[0];
        let args = parts.slice(1);

        // Windows Explicit Wrapper
        if (process.platform === 'win32') {
            args = ['/c', cmd, ...args];
            cmd = 'cmd.exe';
        }

        log(`Running: ${cmdString}`, 'INFO');

        const child = spawn(cmd, args, {
            stdio: 'inherit',
            cwd: cwd,
            env: ENV,
            ...opts
        });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command '${cmdString}' failed with code ${code}`));
        });

        child.on('error', (err) => reject(err));
    });
};

// --- Helpers: Port Killing (PID specific) ---
const getPidForPort = (port) => {
    try {
        // netstat -ano | findstr :<PORT>
        const output = execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' }).toString();
        // Lines look like: "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234"
        const lines = output.split('\n').filter(l => l.includes('LISTENING'));
        if (lines.length > 0) {
            const parts = lines[0].trim().split(/\s+/);
            return parts[parts.length - 1]; // Last column is PID
        }
    } catch (e) {
        // Findstr returns 1 if not found, execSync throws. Ignore.
    }
    return null;
};

const killPort = async (port) => {
    if (DRY_RUN) return;
    const pid = getPidForPort(port);
    if (pid) {
        log(`Port ${port} is busy (PID ${pid}). Killing...`, 'WARN');
        try {
            execSync(`taskkill /F /PID ${pid}`);
            log(`Killed PID ${pid}.`, 'OK');
        } catch (e) {
            log(`Failed to kill PID ${pid}: ${e.message}`, 'ERR');
        }
    } else {
        log(`Port ${port} is free.`, 'INFO');
    }
};

// --- Helpers: Smart Install ---
const getFileHash = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
};

const checkAndInstall = async (dir, label) => {
    const lockFile = path.join(dir, 'package-lock.json');
    const hashFile = path.join(dir, 'node_modules', '.install_hash');

    if (!fs.existsSync(lockFile)) {
        log(`No lockfile for ${label}, running install...`, 'WARN');
        await runCommand('npm install', dir);
        return;
    }

    const currentHash = getFileHash(lockFile);
    let storedHash = null;
    if (fs.existsSync(hashFile)) storedHash = fs.readFileSync(hashFile, 'utf8').trim();

    if (currentHash === storedHash && fs.existsSync(path.join(dir, 'node_modules'))) {
        log(`Skipping install for ${label} (Up to date)`, 'SKIP');
        return;
    }

    log(`Installing dependencies for ${label}...`, 'INFO');

    // EPERM Hardening for sqlite3 (common issue)
    try {
        await runCommand('npm ci', dir);
    } catch (e) {
        log(`Install failed (${e.message}). Checking for sqlite3 lock...`, 'WARN');
        const sqliteDir = path.join(dir, 'node_modules', 'sqlite3');
        if (fs.existsSync(sqliteDir)) {
            try {
                log(`Deleting ${sqliteDir} to clear EPERM...`, 'WARN');
                fs.rmSync(sqliteDir, { recursive: true, force: true });
            } catch (rmErr) {
                log(`Could not delete sqlite3: ${rmErr.message}`, 'ERR');
            }
        }
        log(`Retrying install...`, 'INFO');
        await runCommand('npm install', dir); // Fallback to install
    }

    // Save hash
    if (fs.existsSync(path.join(dir, 'node_modules'))) {
        fs.writeFileSync(hashFile, currentHash);
    }
}

// --- Steps ---

const prepareWorkdir = () => {
    log(`--- 1. Preparing Dev Workdir: ${WORKDIR_PATH} ---`);
    if (DRY_RUN) {
        log(`(DRY) Workdir Prep`, 'WARN');
        return;
    }

    if (!fs.existsSync(WORKDIR_PATH)) {
        fs.mkdirSync(WORKDIR_PATH, { recursive: true });
    }

    if (process.platform === 'win32') {
        try {
            log(`Robocopying source...`);
            // Exclude heavies but keep standard dev config
            execSync(`robocopy "${CWD}" "${WORKDIR_PATH}" /MIR /XD node_modules .git dist build .cache backups coverage .vscode /XF .env /R:1 /W:1 /NJH /NJS`, { stdio: 'pipe' });
        } catch (e) {
            if (e.status > 7) {
                log(`Robocopy failed: ${e.message}`, 'ERR'); // Robocopy exit code < 8 is success/partial
                throw e;
            }
        }

        if (fs.existsSync(path.join(CWD, '.env'))) {
            fs.copyFileSync(path.join(CWD, '.env'), path.join(WORKDIR_PATH, '.env'));
        }
    }
    log('Workdir Ready.', 'OK');
};

const setupDb = async () => {
    const dbDir = path.join(WORKDIR_PATH, 'db');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const dbFile = path.join(dbDir, 'database.sqlite');
    Object.assign(ENV, {
        DB_CLIENT: 'sqlite',
        SQLITE_FILENAME: dbFile,
        AUTH_MODE: 'required',
        QA_MODE: 'true'
    });

    log(`--- 3. DB Setup (${dbFile}) ---`);
    await runCommand('npm run db:migrate', WORKDIR_PATH);
    await runCommand('npm run db:seed:smoke', WORKDIR_PATH);
}

const startDev = async () => {
    log('--- 4. Starting Servers ---');

    log('\n✅ BACKEND:  http://localhost:3000');
    log('✅ FRONTEND: http://localhost:5173');
    log('✅ HEALTH:   http://localhost:3000/api/health/modules\n', 'OK');

    if (DRY_RUN) return;

    // Use concurrently from the workdir context or just run npm run dev
    await runCommand('npm run dev', WORKDIR_PATH);
};

// --- Main ---
(async () => {
    log(`ZERO-STRESS RUNNER`, 'INFO');
    log(`Source: ${CWD}`);
    log(`Target: ${WORKDIR_PATH}`);

    try {
        // 0. Kill Ports
        await killPort(3000);
        await killPort(5173);

        // 1. Prepare
        prepareWorkdir();

        // 2. Install (Smart Split)
        await checkAndInstall(WORKDIR_PATH, 'ROOT');
        await checkAndInstall(path.join(WORKDIR_PATH, 'client'), 'CLIENT');

        // 3. DB
        await setupDb();

        // 4. Start
        await startDev();

    } catch (e) {
        log(`Failed: ${e.message}`, 'ERR');
        process.exit(1);
    }
})();
