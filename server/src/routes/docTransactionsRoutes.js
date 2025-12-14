const express = require('express');
const router = express.Router();
const TransactionsService = require('../services/TransactionsService');
const { requireEntitlement } = require('../middlewares/entitlements');

router.get('/:id/transactions', requireEntitlement('transactions'), async (req, res) => {
    try {
        const orgId = req.ctx.org.id;
        const project = req.query.project || 'default';

        const rows = await TransactionsService.listForDoc({ orgId, project, documentId: req.params.id });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
