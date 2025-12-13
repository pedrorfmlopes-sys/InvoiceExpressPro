// server/src/config/constants.js
const path = require('path');

// Assuming server/src/config structure, root is ../../../
// But wait, original server.js was in server/, so __dirname there was server/
// root data was '../data' relative to server/
// Here we are in server/src/config
const SERVER_ROOT = path.resolve(__dirname, '../../'); // server/
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '../'); // root
const DATA_ROOT = path.resolve(PROJECT_ROOT, 'data');

module.exports = {
    PATHS: {
        ROOT: DATA_ROOT,
        PROJECTS: path.join(DATA_ROOT, 'projects'),
        CONFIG: path.join(DATA_ROOT, 'config'),
        UPLOADS: path.join(PROJECT_ROOT, 'uploads'), // Assuming uploads is at root as seen in tree
        CLIENT_DIST: path.resolve(PROJECT_ROOT, 'client/dist'),
    },
    DEFAULTS: {
        PORT: 3000,
        HOST: '0.0.0.0'
    }
};
