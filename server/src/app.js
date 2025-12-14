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

// 4. Protected API Routes
const { requireAuth } = require('./middlewares/auth');
app.use('/api', requireAuth); // Blocks everything under /api not whitelist

// Routes
app.use('/api', require('./routes/projectRoutes'));
app.use('/api', require('./routes/docRoutes'));
app.use('/api', require('./routes/extractRoutes'));

// Modular V2 Reports Strategy (Modules Directory)
const reportsV2 = require('./modules/reportsV2');
app.use('/api/v2/reports', reportsV2.router);

// Core V2
app.use('/api/v2', require('./routes/v2Routes'));

// Parity Routes
app.use('/api/config', require('./routes/configRoutes'));
app.use('/api', require('./routes/exportRoutes')); // Keeps /export.xlsx
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/transactions', require('./routes/transactionsRoutes'));
// For doc extensions, we can mount on /api/doc via merge params or just separate file mounting
app.use('/api/doc', require('./routes/docTransactionsRoutes'));

app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/normalize', require('./routes/normalizeRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

// 5. SPA Fallback (Public) - For any other route, serve index.html
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(PATHS.CLIENT_DIST, 'index.html'));
});

module.exports = app;
