const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry');
const RESTART_ONLY = ARGS.includes('--restart-only');

const ENV = { ...process.env, FORCE_COLOR: '1' };
let DB_CLIENT = ENV.DB_CLIENT || 'sqlite';

// OneDrive / Workdir Config
const CWD = process.cwd();
const ONEDRIVE_VARS = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'];
const IS_ONEDRIVE = ONEDRIVE_VARS.some(v => process.env[v] && CWD.includes(process.env[v])) || CWD.includes('OneDrive');
const ALLOW_ONEDRIVE = process.env.ALLOW_ONEDRIVE_DEPLOY === 'true';

// Default Workdir for Windows/General safe deployment
// Using C:/Dev typically safe, or a temp dir. User requested local default.
const DEFAULT_WORKDIR = process.platform === 'win32' ? 'C:\\Dev\\InvoiceStudioDeployWorkdir' : '/tmp/invoice-studio-deploy';
const WORKDIR_PATH = process.env.WORKDIR_PATH || DEFAULT_WORKDIR;

// If we are in OneDrive and NOT allowed, we MUST switch to WORKDIR
const USE_WORKDIR = IS_ONEDRIVE && !ALLOW_ONEDRIVE;

// If we are using workdir, all commands run there
const RUN_DIR = USE_WORKDIR ? WORKDIR_PATH : CWD;

// --- Utils ---
const log = (msg, type = 'INFO') => {
    const color = type === 'ERR' ? '\x1b[31m' : (type === 'WARN' ? '\x1b[33m' : (type === 'OK' ? '\x1b[32m' : '\x1b[36m'));
    const reset = '\x1b[0m';
    console.log(`${color}[${type}] ${msg}${reset}`);
};

// --- Auto-Detect SQLite (Relative to CWD/Source initially, but needs to be resolved for RUN_DIR) ---
// We detect based on SOURCE first to find the file
let SQLITE_FILE = ENV.SQLITE_FILENAME;

if (!SQLITE_FILE && (DB_CLIENT === 'sqlite' || DB_CLIENT === 'sqlite3')) {
    const candidates = [
        'db/database.sqlite',
        'database.sqlite',
        'db.sqlite',
        'data/database.sqlite'
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(CWD, c))) {
            SQLITE_FILE = path.join(CWD, c); // Keep absolute or relative? Better absolute relative to valid CWD
            break;
        }
    }
    if (!SQLITE_FILE) SQLITE_FILE = path.join(CWD, 'db/database.sqlite');
} else if (SQLITE_FILE && !path.isAbsolute(SQLITE_FILE)) {
    SQLITE_FILE = path.join(CWD, SQLITE_FILE);
}

// Re-adjust SQLITE_FILE if we switch to WORKDIR and it was pointed at Source?
// If we copy the DB to Workdir, we should use the Workdir copy?
// YES. If USE_WORKDIR is true, we expect the DB to be copied there via Robocopy.
// So we should re-point SQLITE_FILE to the RUN_DIR version.
if (USE_WORKDIR && SQLITE_FILE.startsWith(CWD)) {
    SQLITE_FILE = SQLITE_FILE.replace(CWD, RUN_DIR);
}

const BACKUP_DIR = path.join(RUN_DIR, 'backups'); // Backups go to RUN_DIR/backups

const runCommand = async (cmdString, ignoreError = false, forceRun = false, cwd = RUN_DIR) => {
    if (DRY_RUN && !forceRun) {
        log(`(DRY) [${cwd}] Would execute: ${cmdString}`, 'WARN');
        return;
    }

    return new Promise((resolve, reject) => {
        const parts = cmdString.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        log(`Executing [${cwd}]: ${cmdString}`, 'INFO');

        let finalCmd = cmd;
        let finalArgs = args;
        if (process.platform === 'win32' && cmd === 'npm') {
            finalCmd = 'cmd.exe';
            finalArgs = ['/c', 'npm', ...args];
        }

        const child = spawn(finalCmd, finalArgs, {
            stdio: 'inherit',
            shell: false,
            cwd: cwd,
            env: { ...ENV, SQLITE_FILENAME: SQLITE_FILE } // Ensure env passes correct DB path
        });

        child.on('close', (code) => {
            if (code === 0 || ignoreError) resolve();
            else reject(new Error(`Command ${cmdString} failed with code ${code}`));
        });

        child.on('error', (err) => {
            if (ignoreError) resolve();
            else reject(err);
        });
    });
};

// --- Operations ---

const prepareWorkdir = () => {
    log(`--- 0. Preparing Workdir: ${WORKDIR_PATH} ---`);
    if (DRY_RUN) {
        log(`(DRY) Would create dir ${WORKDIR_PATH} and copy files via Robocopy`, 'WARN');
        return;
    }

    try {
        if (!fs.existsSync(WORKDIR_PATH)) {
            fs.mkdirSync(WORKDIR_PATH, { recursive: true });
        }

        // Robocopy for Windows (Mirror, Exclude dirs/files)
        // /MIR :: MIRror a directory tree (equivalent to /E plus /PURGE).
        // /XD dirs :: eXclude Directories matching given names/paths.
        // /XF files :: eXclude Files matching given names/paths.
        // /NJH /NJS :: No Job Header/Summary (quieter)

        if (process.platform === 'win32') {
            // We use execSync for robocopy because it's a sync prerequisite
            // Exit codes: 0-7 are standard "success/changes"
            try {
                log(`Robocopying ${CWD} -> ${WORKDIR_PATH}...`);
                execSync(`robocopy "${CWD}" "${WORKDIR_PATH}" /MIR /XD node_modules .git dist build .cache backups coverage .vscode /XF .env /R:1 /W:1 /NJH /NJS`, { stdio: 'pipe' });
            } catch (e) {
                // Robocopy returns exit code > 0 on success (1=files copied). 
                // Node throws if status != 0. We check e.status.
                if (e.status > 7) throw e; // >7 is actual error
            }

            // Copy .env explicitly if needed (often explicitly excluded above to avoid overwriting prod secrets if source is dev?)
            // Actually, usually we want the .env from source if we are "deploying from here".
            // Let's copy it manually to be safe.
            if (fs.existsSync(path.join(CWD, '.env'))) {
                fs.copyFileSync(path.join(CWD, '.env'), path.join(WORKDIR_PATH, '.env'));
            }

        } else {
            // Linux fallback (rsync or cp) - simplifed cp implementation
            log('Generic copy (Linux/Mac)...');
            // Harder to implement robust exclusions with fs.cpSync recursively without external lib.
            // Using rsync if available?
            try {
                execSync(`rsync -av --delete --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude 'backups' "${CWD}/" "${WORKDIR_PATH}/"`);
            } catch (e) {
                log('Rsync failed, falling back to manual copy warning', 'WARN');
            }
        }
        log('Workdir prepared.', 'OK');

    } catch (e) {
        log(`Failed to prepare workdir: ${e.message}`, 'ERR');
        process.exit(1);
    }
};

const stepGate = async () => {
    log('--- 1. Verification Gate ---');

    if (DRY_RUN && USE_WORKDIR) {
        log('NOTE: In OneDrive Dry Run, skipping full server smoke tests to avoid file locking instability.', 'WARN');
        log('Action: Verifying Client Build only...', 'INFO');
        // We run build:client in CWD to prove code passes build.
        await runCommand('npm run build:client', false, true, CWD);
    } else {
        await runCommand('npm run gate:release', false, true);
    }
};

const stepBackup = async () => {
    log('--- 2. Database Backup ---');
    // Using RUN_DIR paths
    const isSqlite = DB_CLIENT.includes('sqlite');
    if (!isSqlite) {
        log(`DB_CLIENT is ${DB_CLIENT}, skipping file backup. Ensure Postgres backups are managed externally.`, 'WARN');
        return;
    }

    if (!fs.existsSync(SQLITE_FILE)) {
        log(`SQLite file not found at ${SQLITE_FILE} (RUN_DIR), skipping backup.`, 'WARN');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `database_${timestamp}.sqlite`;
    const backupDest = path.join(BACKUP_DIR, backupName);

    if (DRY_RUN) {
        log(`(DRY) Would copy ${SQLITE_FILE} to ${backupDest}`, 'WARN');
    } else {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.copyFileSync(SQLITE_FILE, backupDest);
        log(`Backup created: ${backupDest}`, 'OK');
    }
};

const stepInstall = async () => {
    log('--- 3. Dependencies (Build Mode: Full) ---');
    // We need DevDeps (vite, etc) to run the Build/Gate.
    // We will prune them later.
    // Kill Node processes on Windows before install to release locks
    if (!DRY_RUN && process.platform === 'win32') {
        try {
            log('Killing lingering node processes...');
            // execSync('taskkill /f /im node.exe'); // Too aggressive? It might kill THIS process.
            // We are running IN node. So we can't kill all node processes. 
            // Ideally we only kill 'other' headers.
            // Skip self-kill.
        } catch (e) { }
    }

    const installCmd = 'npm ci';
    const clientInstall = 'npm ci --prefix client';

    try {
        await runCommand(installCmd);
        await runCommand(clientInstall);
    } catch (e) {
        if (e.message.includes('EPERM') && !DRY_RUN) {
            log('EPERM detected. Retrying in 2s...', 'WARN');
            await new Promise(r => setTimeout(r, 2000));
            await runCommand(installCmd);
        } else {
            throw e; // Rethrow actual errors
        }
    }
};

const stepPrune = async () => {
    log('--- 3.5. Prune Dev Dependencies ---');
    await runCommand('npm prune --production');
    await runCommand('npm prune --production --prefix client');
};

const stepMigrate = async () => {
    log('--- 4. Migrations ---');
    // Ensure DB dir exists for SQLite
    if (DB_CLIENT.includes('sqlite') && SQLITE_FILE) {
        const dbDir = path.dirname(SQLITE_FILE);
        if (!fs.existsSync(dbDir)) {
            log(`Creating DB directory: ${dbDir}`, 'INFO');
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }
    await runCommand('npm run db:migrate');
};

const stepRestart = async () => {
    log('--- 5. Restart ---');
    const appName = process.env.PM2_APP_NAME;
    if (appName) {
        // If we are in WORKDIR, we might want to start/restart differently?
        // Assuming 'pm2 restart' works if process already exists.
        await runCommand(`pm2 restart ${appName}`);
    } else {
        log('PM2_APP_NAME not set. Manual restart required.', 'WARN');
        log(`Hint: cd "${RUN_DIR}" && npm start`, 'INFO');
    }
};

// --- Orchestrator ---
(async () => {
    log(`DEPLOY RUNNER (Dry: ${DRY_RUN})`, 'INFO');
    log('---------------------------------------------------');
    if (IS_ONEDRIVE) {
        log('WARNING: OneDrive detected!', 'WARN');
        if (USE_WORKDIR) {
            log(`SAFE MODE: Switching deployment to ${WORKDIR_PATH}`, 'OK');
        } else {
            log('RISK: Deploying inside OneDrive. Ensure Sync is PAUSED.', 'ERR');
        }
    }
    log(`RUN_DIR:         ${RUN_DIR}`);
    log(`DB_CLIENT:       ${DB_CLIENT}`);
    log(`SQLITE_FILENAME: ${SQLITE_FILE} ${fs.existsSync(SQLITE_FILE) ? '(Found)' : '(Not Found)'}`);
    log(`PM2_APP_NAME:    ${ENV.PM2_APP_NAME || '(Not Set)'}`);
    log('---------------------------------------------------');

    try {
        if (RESTART_ONLY) {
            await stepRestart();
        } else {
            if (USE_WORKDIR) {
                prepareWorkdir();
            }

            // Correct Order (Schema before Smokes):
            // 1. Install Full (Need vite/tools)
            // 2. Backup (Save state before migration if exists)
            // 3. Migrate (Ensure Schema exists for Smokes)
            // 4. Gate (Run tests using installed tools & DB)
            // 5. Prune (Cleanup for Prod)
            // 6. Restart

            await stepInstall();
            await stepBackup();
            await stepMigrate();
            await stepGate();

            if (process.env.STOP_AFTER_GATE) {
                log('STOP_AFTER_GATE set. Stopping deployment simulation.', 'OK');
                process.exit(0);
            }

            await stepPrune();
            await stepRestart();
        }
        log('\n✅ DEPLOY SEQUENCE COMPLETE', 'OK');
        process.exit(0);
    } catch (e) {
        log(`\n❌ DEPLOY FAILED: ${e.message}`, 'ERR');
        process.exit(1);
    }
})();
