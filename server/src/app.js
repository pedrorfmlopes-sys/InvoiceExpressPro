// server/src/app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PATHS } = require('./config/constants');
const cookieParser = require('cookie-parser');
const { attachContext } = require('./middlewares/auth');

const app = express();

// CORS with credentials for dev/prod
// If client is on same origin (prod), no special CORS needed usually but we keep it explicit.
// For dev (5173 -> 3000), we need origin + credentials.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// 1. Static Client (Public) - Serve before Auth check
app.use('/', express.static(PATHS.CLIENT_DIST));

// Request Logger [DEBUG]
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});



// --- BOOT CHECK: STORAGE PERMISSIONS ---
// Fail fast if we cannot write to the persistent disk
try {
    const fs = require('fs');
    if (!fs.existsSync(PATHS.ROOT)) {
        console.log('[Boot] Creating Data Root:', PATHS.ROOT);
        fs.mkdirSync(PATHS.ROOT, { recursive: true });
    }
    if (!fs.existsSync(PATHS.UPLOADS)) {
        console.log('[Boot] Creating Uploads Dir:', PATHS.UPLOADS);
        fs.mkdirSync(PATHS.UPLOADS, { recursive: true });
    }
    // Test Write
    const testFile = path.join(PATHS.UPLOADS, 'boot_check.txt');
    fs.writeFileSync(testFile, 'OK');
    fs.unlinkSync(testFile);
    console.log('[Boot] Storage Check: PASS (Write Access Confirmed)');
} catch (e) {
    console.error('[Boot] CRITICAL STORAGE ERROR:', e.message);
    console.error('The application normally requires /app/data to be writable.');
    // We don't exit process here to allow the "Health API" to maybe still work, but it's risky.
}

// 2. Auth Context (loads user if token present, doesn't block)
app.use(attachContext);

// 3. Public API Routes
app.use('/api/auth', require('./routes/authRoutes'));

// Health (Modules) - Public
console.log('Mounting Health Module...'); // Debug
const healthCtx = require('./modules/health');
app.use('/api/health', healthCtx.router);
app.use('/api/assets', require('./modules/assets'));

// 4. Protected API Routes
const { requireAuth } = require('./middlewares/auth');
const { attachProjectContext } = require('./middlewares/context');

// --- Global API Context ---
app.use('/api', requireAuth);
app.use('/api', attachProjectContext);

// --- Modular Routes ---
const coreV2 = require('./modules/coreV2');
app.use('/api/corev2', coreV2.router);

app.use('/api/config', require('./modules/config').router);
app.use('/api', require('./routes/projectRoutes'));
app.use('/api', require('./modules/docs').router);
// app.use('/api', require('./routes/extractRoutes')); // Moved to modules/processing

// Modular V2 Reports Strategy (Modules Directory)
const reports = require('./modules/reports'); // Consolidated Reports Module
const transactions = require('./modules/transactions');

// Reports (Unified Module mounted on both prefixes for safety)
app.use('/api/v2/reports', reports.routerV2);
app.use('/api/reports', reports.routerLegacy);

// Core V2 (Already mounted above)
app.use('/api/settings', require('./modules/settings').router);
app.use('/api/explorer', require('./modules/explorer'));

// Labels Module
const { labelsRouter, docLabelsRouter, nodeLabelsRouter } = require('./modules/labels');
app.use('/api/labels', labelsRouter);
app.use('/api/doc-labels', docLabelsRouter);
app.use('/api/node-labels', nodeLabelsRouter);

// Dossiers Module
app.use('/api/dossiers', require('./modules/dossiers'));
app.use('/api/extraction', require('./modules/extraction'));
app.use('/api/proposals', require('./modules/proposalStudio/router'));
app.use('/api/nicolazzi', require('./modules/nicolazziReconciliation/router')); // Nicolazzi specific reconciliation
app.use('/api/ritmonio', require('./modules/ritmonioReconciliation/router')); // Ritmonio specific reconciliation
app.use('/api/axa-fima', require('./modules/axaFimaReconciliation/router')); // AXA & FIMA 3-doc reconciliation
app.use('/api/scarabeo', require('./modules/scarabeoReconciliation/router')); // [NEW] Scarabeo reconciliation
app.use('/api/reconciliation', require('./modules/nicolazziReconciliation/router')); // Unified reconciliation

app.use('/api/logistics', require('./modules/logistics/router')); // Factory calendar & logistics
app.use('/api/crm', require('./modules/crm/router'));
app.use('/api/catalog', require('./modules/catalog/routes'));

// Parity Routes
// Parity Components (Modularized)
app.use('/api', require('./modules/processing').router); // /extract, /progress, /batch
app.use('/api/v2', require('./modules/extraction_v2').router); // [NEW] V2 Extraction
app.use('/api', require('./modules/exports').router);    // /export.xlsx
app.use('/api/normalize', require('./modules/normalize').router);
app.use('/api/audit', require('./modules/audit').router);


// app.use('/api/config', ... moved up);
app.use('/api/transactions', transactions.router);
app.use('/api/templates', require('./routes/templatesRoutes')); // Not modularized yet
// app.use('/api/normalize', require('./routes/normalizeRoutes')); // Handled by module
// app.use('/api/audit', require('./routes/auditRoutes')); // Handled by module

// 5. SPA Fallback (Public) - For any other route, serve index.html
const fs = require('fs'); // Ensure fs is required if not globally available, or rely on variable already present?
// app.js has path required. We need fs.
// Let's modify the imports too or just use require inside if safer, or assume logic.
// app.js doesn't show fs import in preview.
// Better: Return simple message if error occurs in sendFile callback.

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Robust SPA Fallback
    const indexHtml = path.join(PATHS.CLIENT_DIST, 'index.html');
    res.sendFile(indexHtml, (err) => {
        if (err) {
            // If client build is missing (e.g. backend-only deploy), don't crash.
            if (!res.headersSent) {
                res.status(200).send(`
                    <h1>Invoice Studio Backend</h1>
                    <p>API is running.</p>
                    <p>Frontend should be accessed via its own URL.</p>
                `);
            }
        }
    });
});

module.exports = app;
