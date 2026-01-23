const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');

// POST /api/v2/extract
// We reuse the 'ai_extract' entitlement or maybe a new one. sticking to ai_extract for parity.
router.post('/extract', requireEntitlement('ai_extract'), controller.uploadMiddleware, controller.extract);

module.exports = router;
