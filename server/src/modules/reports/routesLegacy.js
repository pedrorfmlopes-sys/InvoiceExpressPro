const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');

// --- Legacy Routes (Strictly for /api/reports) ---
router.get('/suppliers', controller.getSuppliers);
router.get('/monthly', controller.getMonthly);
router.get('/customers', controller.getCustomers);

router.post('/pro-pdf', requireEntitlement('pro_reports'), controller.generateLegacyProPdf);

module.exports = router;
