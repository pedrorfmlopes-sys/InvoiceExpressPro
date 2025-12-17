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


// 2. Auth Context (loads user if token present, doesn't block)
app.use(attachContext);

// 3. Public API Routes
app.use('/api/auth', require('./routes/authRoutes'));

// Health (Modules) - Public
console.log('Mounting Health Module...'); // Debug
const healthCtx = require('./modules/health');
app.use('/api/health', healthCtx.router);

// 4. Protected API Routes
const { requireAuth } = require('./middlewares/auth');
const { attachProjectContext } = require('./middlewares/context');

app.use('/api', requireAuth); // Blocks everything under /api not whitelist

// Resolve Project Context (after Auth, before Routes)
app.use('/api', attachProjectContext);

// Routes
app.use('/api/config', require('./modules/config').router);


app.use('/api', require('./routes/projectRoutes'));
app.use('/api', require('./modules/docs').router); // Mounts docs on /api to match legacy paths (/api/doc/...)
// app.use('/api', require('./routes/extractRoutes')); // Moved to modules/processing

// Modular V2 Reports Strategy (Modules Directory)
const coreV2 = require('./modules/coreV2');
const reports = require('./modules/reports'); // Consolidated Reports Module
const transactions = require('./modules/transactions');

// Reports (Unified Module mounted on both prefixes for safety)
app.use('/api/v2/reports', reports.routerV2);
app.use('/api/reports', reports.routerLegacy);

// Core V2
app.use('/api/v2', coreV2.router);

// Parity Routes
// Parity Components (Modularized)
app.use('/api', require('./modules/processing').router); // /extract, /progress, /batch
app.use('/api', require('./modules/exports').router);    // /export.xlsx
app.use('/api/normalize', require('./modules/normalize').router);
app.use('/api/audit', require('./modules/audit').router);


// app.use('/api/config', ... moved up);
app.use('/api/transactions', transactions.router);
app.use('/api/templates', require('./routes/templatesRoutes')); // Not modularized yet
// app.use('/api/normalize', require('./routes/normalizeRoutes')); // Handled by module
// app.use('/api/audit', require('./routes/auditRoutes')); // Handled by module

// 5. SPA Fallback (Public) - For any other route, serve index.html
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(PATHS.CLIENT_DIST, 'index.html'));
});

module.exports = app;
