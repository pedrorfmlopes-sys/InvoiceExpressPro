// server/src/index.js
const app = require('./app');
const { DEFAULTS } = require('./config/constants');

const PORT = process.env.PORT || DEFAULTS.PORT;
const HOST = process.env.HOST || DEFAULTS.HOST;

app.listen(PORT, HOST, () => {
    console.log(`[Invoice Studio] Server running on http://${HOST}:${PORT} (Phase 1 Logic)`);
});
