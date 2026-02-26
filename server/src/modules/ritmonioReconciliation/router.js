// server/src/modules/ritmonioReconciliation/router.js
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth } = require('../../middlewares/auth');

router.use(requireAuth);

router.get('/discover', controller.discoverMatches);
router.get('/status', controller.getReconciliationReport);

// Invoice-level actions
router.post('/reconcile/:invoiceId', controller.reconcileInvoice);
router.post('/reconcile-manual/:invoiceId', controller.reconcileInvoiceManual);
router.get('/details/:invoiceId', controller.getReconciliationDetails);

router.get('/analytics', controller.getAnalytics);
router.post('/reconciliation/reset', controller.resetAllMatchings);

module.exports = router;
