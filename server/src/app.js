// server/src/app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PATHS } = require('./config/constants');
const { attachContext } = require('./middlewares/auth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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

// Parity Routes
app.use('/api/config', require('./routes/configRoutes'));
app.use('/api', require('./routes/exportRoutes')); // Keeps /export.xlsx
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/normalize', require('./routes/normalizeRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));


// Static Client
// IMPORTANT: Serve client/dist
app.use('/', express.static(PATHS.CLIENT_DIST));

module.exports = app;
