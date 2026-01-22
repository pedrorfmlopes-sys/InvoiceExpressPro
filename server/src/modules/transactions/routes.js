const express = require('express');
const router = express.Router();
const TransactionsService = require('../../services/TransactionsService');
const AutoLinkService = require('../../services/AutoLinkService');
const ZipService = require('../../services/ZipService');
const { requireEntitlement } = require('../../middlewares/entitlements');

// Middleware to normalize project/org
// In Phase 3, req.ctx has orgId. req.query.project handles project.
const getContext = (req, res, next) => {
    if (!req.ctx) return res.status(500).json({ error: 'Context missing' });
    req.orgId = req.ctx.org.id;
    // req.project is already set by global attachProjectContext
    next();
};

router.use(getContext);

// 1. List
router.get('/', requireEntitlement('transactions'), async (req, res) => {
    try {
        const { q, status } = req.query;
        const rows = await TransactionsService.list({ orgId: req.orgId, project: req.project, q, status });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Create
router.post('/', requireEntitlement('transactions'), async (req, res) => {
    try {
        const row = await TransactionsService.create({
            orgId: req.orgId,
            project: req.project,
            ...req.body
        });
        res.json(row);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get Detail
router.get('/:id', requireEntitlement('transactions'), async (req, res) => {
    try {
        const row = await TransactionsService.get({ orgId: req.orgId, project: req.project, id: req.params.id });
        if (!row) return res.status(404).json({ error: 'Not Found' });
        res.json(row);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Update
router.patch('/:id', requireEntitlement('transactions'), async (req, res) => {
    try {
        const row = await TransactionsService.update({
            orgId: req.orgId,
            project: req.project,
            id: req.params.id,
            patch: req.body
        });
        res.json(row);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Link Doc
router.post('/:id/link', requireEntitlement('transactions'), async (req, res) => {
    try {
        const row = await TransactionsService.linkDoc({
            orgId: req.orgId,
            project: req.project,
            transactionId: req.params.id,
            documentId: req.body.documentId,
            linkType: req.body.linkType,
            source: 'manual'
        });
        res.json(row);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Unlink Doc
router.post('/:id/unlink', requireEntitlement('transactions'), async (req, res) => {
    try {
        await TransactionsService.unlinkDoc({
            orgId: req.orgId,
            project: req.project,
            transactionId: req.params.id,
            documentId: req.body.documentId
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Suggestions (Entitlement: auto_linking)
router.get('/:id/suggestions', requireEntitlement('auto_linking'), async (req, res) => {
    try {
        const rows = await AutoLinkService.suggest({
            orgId: req.orgId,
            project: req.project,
            transactionId: req.params.id,
            threshold: req.query.threshold ? parseFloat(req.query.threshold) : 0.5
        });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8. Apply Suggestions (Entitlement: auto_linking)
router.post('/:id/apply-suggestions', requireEntitlement('auto_linking'), async (req, res) => {
    try {
        const applied = await AutoLinkService.apply({
            orgId: req.orgId,
            project: req.project,
            transactionId: req.params.id,
            threshold: req.body.threshold
        });
        res.json({ applied });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 9. Download Zip (Entitlement: exports_zip)
router.get('/:id/download.zip', requireEntitlement('exports_zip'), async (req, res) => {
    try {
        await ZipService.createTransactionZip(req.orgId, req.project, req.params.id, res);
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

module.exports = router;
