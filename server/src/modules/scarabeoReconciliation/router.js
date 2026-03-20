const express = require('express');
const router = express.Router();
const ScarabeoReconciliationController = require('./controller');

router.post('/reconcile', ScarabeoReconciliationController.reconcile);
router.get('/discover', ScarabeoReconciliationController.discover);
router.get('/report', ScarabeoReconciliationController.getReport);
router.get('/details/:invoiceId', ScarabeoReconciliationController.getDetails);

module.exports = router;
