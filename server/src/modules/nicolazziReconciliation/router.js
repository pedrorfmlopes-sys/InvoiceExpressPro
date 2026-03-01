const express = require('express');
const router = express.Router();
const controller = require('./controller');

// GET /api/nicolazzi/report
router.get('/report', controller.getReport);

// POST /api/nicolazzi/report/export
router.post('/report/export', controller.exportReport);

// POST /api/nicolazzi/report/export-pdf
router.post('/report/export-pdf', controller.exportFulfillmentPdfMultiple);

// GET /api/nicolazzi/analytics
router.get('/analytics', controller.getAnalytics);

// GET /api/nicolazzi/analytics/late-export
router.get('/analytics/late-export', controller.exportLateItemsExcel);

// POST /api/nicolazzi/reconcile/:id
router.post('/reconcile/:id', controller.reconcile);
router.post('/reconcile-manual/:id', controller.reconcileManual);

// GET /api/nicolazzi/reconcile/:id/details
router.get('/reconcile/:id/details', controller.getDetails);

// POST /api/nicolazzi/reconcile/:id/unlink
router.post('/reconcile/:id/unlink', controller.unlink);

// GET /api/nicolazzi/discover
router.get('/discover', controller.discoverMatches);

// POST /api/reconciliation/reset
router.post('/reset', controller.resetAllMatchings);

// GET /api/nicolazzi/proposals/:id/fulfillment
router.get('/proposals/:id/fulfillment', controller.getProposalFulfillment);

// GET /api/nicolazzi/proposals/:id/fulfillment/pdf
router.get('/proposals/:id/fulfillment/pdf', controller.exportFulfillmentPdf);

module.exports = router;
