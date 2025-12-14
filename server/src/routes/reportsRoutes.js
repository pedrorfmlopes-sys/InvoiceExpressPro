const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

const { requireEntitlement } = require('../middlewares/entitlements');

router.get('/suppliers', reportsController.getSuppliers);
router.get('/monthly', reportsController.getMonthly);
router.get('/customers', reportsController.getCustomers);

router.post('/pro-pdf', requireEntitlement('pro_reports'), (req, res) => {
    // Mock implementation for Phase 3.1
    res.json({ message: 'Pro PDF Report Generated', project: req.query.project });
});

module.exports = router;
