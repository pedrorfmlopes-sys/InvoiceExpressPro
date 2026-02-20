const express = require('express');
const router = express.Router();
const controller = require('./controller');

// GET /api/nicolazzi/report
router.get('/report', controller.getReport);

// POST /api/nicolazzi/reconcile/:id
router.post('/reconcile/:id', controller.reconcile);

// GET /api/nicolazzi/reconcile/:id/details
router.get('/reconcile/:id/details', controller.getDetails);

// GET /api/nicolazzi/proposals/:id/fulfillment
router.get('/proposals/:id/fulfillment', controller.getProposalFulfillment);

module.exports = router;
