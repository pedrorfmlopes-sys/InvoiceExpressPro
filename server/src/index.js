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

// --- DEBUG DIAGNOSTIC ---
console.log('[DIAGNOSTIC] Starting Server...');
console.log(`[DIAGNOSTIC] ENV DB_CLIENT: ${process.env.DB_CLIENT ? `"${process.env.DB_CLIENT}"` : 'UNDEFINED'}`);
console.log(`[DIAGNOSTIC] ENV DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (Masked)' : 'UNDEFINED'}`);
// ------------------------

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

    // --- Logistics Calibration ---
    const { 
        seedNicolazziCalendar, 
        seedRitmonioCalendar, 
        seedFimaCalendar, 
        seedScarabeoCalendar,
        seedAXACalendar,
        seedBetteCalendar,
        seedButoCalendar
    } = require('./modules/logistics/calendarEngine');

    seedNicolazziCalendar().catch(e => console.error('[Logistics] Failed to seed Nicolazzi calendar:', e));
    seedRitmonioCalendar().catch(e => console.error('[Logistics] Failed to seed Ritmonio calendar:', e));
    seedFimaCalendar().catch(e => console.error('[Logistics] Failed to seed Fima calendar:', e));
    seedScarabeoCalendar().catch(e => console.error('[Logistics] Failed to seed Scarabeo calendar:', e));
    seedAXACalendar().catch(e => console.error('[Logistics] Failed to seed AXA calendar:', e));
    seedBetteCalendar().catch(e => console.error('[Logistics] Failed to seed Bette calendar:', e));
    seedButoCalendar().catch(e => console.error('[Logistics] Failed to seed Buto calendar:', e));

    // Schedule
    setInterval(runCleanup, CLEANUP_INTERVAL);
});

