const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');

router.post('/extract', requireEntitlement('ai_extract'), controller.uploadMiddleware, controller.extract);
router.post('/reprocess/:id', requireEntitlement('ai_extract'), controller.reprocess);
router.get('/progress/:batchId', controller.getProgress);
router.get('/batch/:batchId', controller.getBatch);

module.exports = router;
