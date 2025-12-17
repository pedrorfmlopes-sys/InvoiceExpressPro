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

app.listen(PORT, HOST, () => {
    console.log(`[Invoice Studio] Server running on http://${HOST}:${PORT} (Phase 1 Logic)`);
});
