const express = require('express');
const router = express.Router();
const ctrl = require('./controller');

// --- Order Confirmation ---
// POST /api/axa-fima/reconcile-oc/:id          — auto link OC to proposal
router.post('/reconcile-oc/:id', ctrl.reconcileOc);
// POST /api/axa-fima/reconcile-oc-manual/:id   — force link to specific proposal
router.post('/reconcile-oc-manual/:id', ctrl.reconcileOcManual);

// --- Invoice ---
// POST /api/axa-fima/reconcile/:id             — auto link invoice to proposal
router.post('/reconcile/:id', ctrl.reconcileInvoice);
// POST /api/axa-fima/reconcile-manual/:id      — force link to specific proposal
router.post('/reconcile-manual/:id', ctrl.reconcileInvoiceManual);

// --- Unlink ---
// POST /api/axa-fima/reconcile/:id/unlink
router.post('/reconcile/:id/unlink', ctrl.unlink);

// --- Report ---
// GET /api/axa-fima/report
router.get('/report', ctrl.getReport);

// --- Discovery ---
// GET /api/axa-fima/discover          — unlinked invoices
router.get('/discover', ctrl.discoverInvoices);
// GET /api/axa-fima/discover-ocs      — unlinked OCs
router.get('/discover-ocs', ctrl.discoverOcs);

// --- Reset ---
// POST /api/axa-fima/reset
router.post('/reset', ctrl.resetAllMatchings);

module.exports = router;
