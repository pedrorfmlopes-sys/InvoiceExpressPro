const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireEntitlement } = require('../../middlewares/entitlements');

// --- V2 Routes (Strictly for /api/v2/reports) ---
const v2Auth = requireEntitlement('reports_v2');

router.get('/summary', v2Auth, controller.getSummary);
router.get('/top-suppliers', v2Auth, controller.getTopSuppliers);
router.get('/top-customers', v2Auth, controller.getTopCustomers);
router.get('/monthly-totals', v2Auth, controller.getMonthlyTotals);

// PDF
router.post('/pdf', v2Auth, requireEntitlement('reports_pdf_basic'), controller.generatePdfBasic);
router.post('/pdf-pro', v2Auth, requireEntitlement('reports_pdf_pro'), controller.generatePdfPro);

// Export
router.get('/export', v2Auth, requireEntitlement('reports_export'), controller.exportData);

module.exports = router;
