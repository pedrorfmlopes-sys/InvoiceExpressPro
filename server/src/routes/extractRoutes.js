// server/src/routes/extractRoutes.js
const express = require('express');
const router = express.Router();
const extractController = require('../controllers/extractController');

const { requireEntitlement } = require('../middlewares/entitlements');

router.post('/extract', requireEntitlement('ai_extract'), extractController.uploadMiddleware, extractController.extract);
router.get('/progress/:batchId', extractController.getProgress);
router.get('/batch/:batchId', extractController.getBatch);

module.exports = router;
