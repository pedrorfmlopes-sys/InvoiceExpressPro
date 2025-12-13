const jsonAdapter = require('./JsonDocsAdapter');
const dbAdapter = require('./DbDocsAdapter');

module.exports = (() => {
    let client = (process.env.DB_CLIENT || '').trim().toLowerCase();

    // Normalize aliases
    if (client === 'sqlite3') client = 'sqlite';
    if (client === 'postgres' || client === 'postgresql') client = 'pg';

    const isValidDb = (client === 'sqlite' || client === 'pg');

    if (isValidDb) {
        console.log(`[Storage] Using DB Adapter (${client})`);
        return dbAdapter;
    }

    // Invalid or missing client
    if (process.env.ALLOW_JSON_FALLBACK === 'true') {
        console.warn('[Storage] WARNING: DB_CLIENT invalid/set but falling back to JSON due to ALLOW_JSON_FALLBACK=true');
        console.log('[Storage] Using JSON Files Adapter');
        return jsonAdapter;
    }

    // Strict Mode (Phase 3.2 Default)
    console.error('[Storage] CRITICAL: DB_CLIENT not set or invalid. Set DB_CLIENT=sqlite or DB_CLIENT=pg');
    console.error('[Storage] To use legacy JSON, set ALLOW_JSON_FALLBACK=true');
    process.exit(1);
})();
