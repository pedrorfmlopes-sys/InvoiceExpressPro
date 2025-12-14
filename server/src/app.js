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
// Global Auth/Context (replacing legacy attachEntitlements)
app.use(attachContext);

app.use('/api/auth', require('./routes/authRoutes'));

const { requireAuth } = require('./middlewares/auth');
// Protect all API routes below (except whitelisted)
app.use(requireAuth);

// Routes
app.use('/api', require('./routes/projectRoutes'));
app.use('/api', require('./routes/docRoutes'));
app.use('/api', require('./routes/extractRoutes'));

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


// Static Client
// IMPORTANT: Serve client/dist
app.use('/', express.static(PATHS.CLIENT_DIST));

module.exports = app;
