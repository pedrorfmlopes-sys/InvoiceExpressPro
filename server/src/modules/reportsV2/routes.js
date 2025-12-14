const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');

// Middleware to ensure V2 is actually enabled globally if we wanted, 
// but user asked for per-feature entitlements.
// We'll apply 'reports_v2' entitlement to all these routes as a baseline.
const v2Auth = requireEntitlement('reports_v2');

router.use(v2Auth);

router.get('/summary', controller.getSummary);
router.get('/top-suppliers', controller.getTopSuppliers);
router.get('/top-customers', controller.getTopCustomers);
router.get('/monthly-totals', controller.getMonthlyTotals);

// PDF
router.post('/pdf', requireEntitlement('reports_pdf_basic'), controller.generatePdfBasic);
router.post('/pdf-pro', requireEntitlement('reports_pdf_pro'), controller.generatePdfPro);

// Export (Wrapper handles CSV vs XLSX)
// User asked to "reusar export streaming existente"
router.get('/export', requireEntitlement('reports_export'), controller.exportData);

module.exports = router;
