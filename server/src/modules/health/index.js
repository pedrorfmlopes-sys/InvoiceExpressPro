const express = require('express');
const router = express.Router();

const { DB_CLIENT, AUTH_MODE } = process.env;

console.log('[Health] Loading module...'); // Debug log

// "Auto-Discovery" via explicit require (standard for backend modules)
// This avoids FS scanning issues and ensures we only report what is actually linked.
const modules = [
    require('../coreV2'),
    require('../transactions'),
    require('../docs'),
    require('../reports'),
    require('../processing'),
    require('../exports'),
    require('../normalize'),
    require('../audit')
    // Self (health) added manually below to avoid circular require
];

const selfMeta = {
    name: 'health',
    prefixes: ['/api/health'],
    closed: true,
    strictRouting: true
};

const getModulesHealth = (req, res) => {
    const modulesList = modules.map(m => {
        if (m.meta) return m.meta;
        return { name: 'unknown', error: 'meta missing', closed: false };
    });
    modulesList.push(selfMeta);

    res.json({
        ok: true,
        modules: modulesList,
        runtime: {
            authMode: AUTH_MODE || 'unknown',
            dbClient: DB_CLIENT || 'unknown',
            nodeEnv: process.env.NODE_ENV
        }
    });
};

router.get('/modules', getModulesHealth);

module.exports = {
    router,
    meta: {
        name: 'health',
        prefixes: ['/api/health'],
        closed: true,
        strictRouting: true
    }
};
