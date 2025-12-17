const { spawn } = require('child_process');
const path = require('path');

// --- Configuration ---
const MODE = process.argv[2] || 'precommit'; // precommit | release

const ENV = {
    ...process.env,
    DB_CLIENT: 'sqlite',
    AUTH_MODE: 'required', // Enforce real auth logic
    QA_MODE: 'true',       // Allow seeding/resetting if needed by tests
    FORCE_COLOR: '1'       // Keep colors
};

const WRAPPER = 'node scripts/run_smoke_with_server.js';
const CLIENT_BUILD = 'npm run build:client';

// Command Lists
const COMMANDS = {
    precommit: [
        CLIENT_BUILD,
        `${WRAPPER} node scripts/smoke_health.js`,
        `${WRAPPER} node scripts/smoke_m1_docs.js`,
        `${WRAPPER} node scripts/smoke_m9_reports_v2.js`
    ],
    release: [
        CLIENT_BUILD,
        // Existing Smokes
        `${WRAPPER} node scripts/smoke_v2_7_rbac.js`,
        `${WRAPPER} node scripts/smoke_v2_9_auth_refresh.js`,
        `${WRAPPER} node scripts/smoke_v3_0_reports.js`,
        `${WRAPPER} node scripts/smoke_v3_1_reports_v2.js`,
        // Module Smokes
        `${WRAPPER} node scripts/smoke_m1_docs.js`,
        `${WRAPPER} node scripts/smoke_m2_processing.js`,
        `${WRAPPER} node scripts/smoke_m3_exports.js`,
        `${WRAPPER} node scripts/smoke_m4_normalize.js`,
        `${WRAPPER} node scripts/smoke_m5_audit.js`,
        `${WRAPPER} node scripts/smoke_m6_transactions.js`,
        `${WRAPPER} node scripts/smoke_m7_coreV2.js`,
        `${WRAPPER} node scripts/smoke_m8_reports_legacy.js`,
        `${WRAPPER} node scripts/smoke_m9_reports_v2.js`,
        `${WRAPPER} node scripts/smoke_config.js`,
        `${WRAPPER} node scripts/smoke_health.js`
    ]
};

// --- Utils ---
const formatDuration = (ms) => (ms / 1000).toFixed(2) + 's';

const runCommand = async (cmdString) => {
    return new Promise((resolve, reject) => {
        const parts = cmdString.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        console.log(`\n> EXEC (hardened): ${cmd} ${args.join(' ')}`);
        const start = Date.now();

        // Handle npm/node cross-platform
        let finalCmd = cmd;
        let finalArgs = args;

        if (process.platform === 'win32' && cmd === 'npm') {
            // Explicitly use cmd /c to run npm on Windows without shell: true warning
            // and avoiding direct npm.cmd spawn issues (EINVAL)
            finalCmd = 'cmd.exe';
            finalArgs = ['/c', 'npm', ...args];
        }

        const child = spawn(finalCmd, finalArgs, {
            stdio: 'inherit',
            shell: false, // HARDENED
            env: ENV
        });

        child.on('close', (code) => {
            const duration = Date.now() - start;
            if (code === 0) {
                resolve({ cmd: cmdString, code, duration });
            } else {
                reject({ cmd: cmdString, code, duration });
            }
        });

        child.on('error', (err) => {
            reject({ cmd: cmdString, error: err, duration: Date.now() - start });
        });
    });
};

// --- Main ---
(async () => {
    console.log(`\n=== GATE RUNNER: ${MODE.toUpperCase()} ===`);
    console.log('Environment:', {
        DB_CLIENT: ENV.DB_CLIENT,
        AUTH_MODE: ENV.AUTH_MODE,
        QA_MODE: ENV.QA_MODE
    });

    const cmds = COMMANDS[MODE];
    if (!cmds) {
        console.error(`Unknown mode: ${MODE}`);
        process.exit(1);
    }

    const results = [];
    let failed = false;

    for (const cmd of cmds) {
        try {
            const res = await runCommand(cmd);
            results.push({ ...res, status: 'PASS' });
        } catch (err) {
            console.error(`\n❌ COMMAND FAILED: ${err.cmd || 'Unknown'}`);
            console.error('Details:', err);
            results.push({ ...(typeof err === 'object' ? err : { error: err }), cmd: cmd, status: 'FAIL' });
            failed = true;
            break; // Fail Fast
        }
    }

    console.log(`\n=== GATE SUMMARY: ${MODE.toUpperCase()} ===`);
    console.table(results.map(r => ({
        Command: (r.cmd || 'Unknown').length > 50 ? (r.cmd || 'Unknown').substring(0, 47) + '...' : (r.cmd || 'Unknown'),
        Status: r.status,
        Duration: formatDuration(r.duration || 0)
    })));

    if (failed) {
        console.error('\n❌ BUILD/TESTS FAILED');
        process.exit(1);
    } else {
        console.log('\n✅ ALL CHECKS PASSED');
        process.exit(0);
    }
})();
