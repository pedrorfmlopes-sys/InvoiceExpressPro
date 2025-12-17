const express = require('express');
const router = express.Router();
const docController = require('./controller');
const TransactionsService = require('../../services/TransactionsService');
const { requireEntitlement } = require('../../middlewares/entitlements');

// From docRoutes.js (Paths relative to mount. Wait, we must match old paths!)
// Old mount: app.use('/api', require('./routes/docRoutes'));
// Old path inside docRoutes: /doc/:id -> /api/doc/:id
// So here we keep /doc/:id if mounted on /api

router.patch('/doc/:id', docController.updateDoc);
router.delete('/doc/:id', docController.deleteDoc);
router.post('/doc/finalize', docController.finalizeDoc);
router.post('/docs/finalize-bulk', docController.finalizeBulk);

router.get('/doc/view', docController.viewDoc);

// Excel/Data
router.get('/excel.json', docController.getExcelJson);

// From docTransactionsRoutes.js
// Old mount: app.use('/api/doc', require('./routes/docTransactionsRoutes'));
// Old path inside: /:id/transactions -> /api/doc/:id/transactions
// To match this in a single router mounted on /api, we use /doc/:id/transactions

router.get('/doc/:id/transactions', requireEntitlement('transactions'), async (req, res) => {
    try {
        const orgId = req.ctx.org.id;
        // const project = req.project; // Handled by controller usually, but here logic is inline
        // Inline logic needs req.project too
        const project = req.project || 'default';

        const rows = await TransactionsService.listForDoc({ orgId, project, documentId: req.params.id });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
