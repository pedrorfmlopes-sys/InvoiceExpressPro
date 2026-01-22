const { spawn } = require('child_process');
const path = require('path');

const TESTS = [
    // 1. Config (User explicitly asked)
    'scripts/smoke_config.js',
    // 2. Process / Upload (User explicitly asked)
    // smoke_process_v2.js seems relevant
    'scripts/smoke_process_v2.js',
    // 3. Dashboard / Reports (User explicitly asked)
    'scripts/smoke_v3_1_reports_v2.js',
    // 4. Auth & RBAC (Base stability)
    'scripts/smoke_v2_6_auth.js',
    // 5. Explorer (New module)
    'scripts/smoke_explorer.js'
];

async function runScript(script) {
    return new Promise((resolve, reject) => {
        console.log(`\n>>> RUNNING: ${script} <<<`);
        const proc = spawn('node', [script], { stdio: 'inherit', shell: true });
        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`>>> PASS: ${script}`);
                resolve();
            } else {
                console.error(`>>> FAIL: ${script} (Exit Code: ${code})`);
                reject(new Error(`Test failed: ${script}`));
            }
        });
    });
}

async function main() {
    console.log("=== STARTING REGRESSION SUITE ===");
    try {
        for (const t of TESTS) {
            await runScript(t);
        }
        console.log("\n=== ALL TESTS PASSED ===");
    } catch (e) {
        console.error("\n=== SUITE FAILED ===");
        process.exit(1);
    }
}

main();
