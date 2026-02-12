// server/src/index.js
require('dotenv').config(); // Load env vars

// SECURITY GUARD: Block optional auth in production
if (process.env.NODE_ENV === 'production' && (process.env.AUTH_MODE === 'optional' || !process.env.AUTH_MODE)) {
    console.error('FATAL: AUTH_MODE=optional is not allowed in production!');
    process.exit(1);
}

const app = require('./app');
const { DEFAULTS } = require('./config/constants');
const PORT = process.env.PORT || DEFAULTS.PORT;
const HOST = process.env.HOST || DEFAULTS.HOST;
const db = require('./db/knex'); // Import knex instance

const startServer = async () => {
    try {
        console.log('[Startup] Running Database Migrations...');
        await db.migrate.latest();
        console.log('[Startup] Migrations completed successfully.');
    } catch (err) {
        console.error('[Startup] Migration failed:', err);
        // Continue anyway? Or exit? safely continue to allow debugging if needed, but DB might be broken.
    }

    app.listen(PORT, HOST, () => {
        console.log(`[Invoice Studio] Server running on http://${HOST}:${PORT} (Phase 1 Logic)`);

        // --- Phase 8: Automated Backup Cleanup ---
        const Adapter = require('./storage/getDocsAdapter');
        const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 Hours

        const runCleanup = async () => {
            try {
                console.log('[Cleanup] Running expired backups cleanup...');
                const count = await Adapter.cleanupExpiredBackups();
                console.log(`[Cleanup] Successfully removed ${count} expired backups.`);
            } catch (e) {
                console.error('[Cleanup] Failed to run backup cleanup:', e.message);
            }
        };

        // Run on startup
        runCleanup();
        // Schedule
        setInterval(runCleanup, CLEANUP_INTERVAL);
    });
