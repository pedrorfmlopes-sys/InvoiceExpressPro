// server/src/modules/ritmonioReconciliation/controller.js
const service = require('./service');

exports.discoverMatches = async (req, res) => {
    try {
        const matches = await service.discoverMatches();
        res.json({ matches });
    } catch (err) {
        console.error('[Ritmonio Recon API] discoverMatches Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.reconcileInvoice = async (req, res) => {
    try {
        const result = await service.reconcileInvoice(req.params.invoiceId);
        res.json(result);
    } catch (err) {
        console.error('[Ritmonio Recon API] reconcileInvoice Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.reconcileInvoiceManual = async (req, res) => {
    try {
        const result = await service.reconcileInvoice(req.params.invoiceId, req.body.proposal_id);
        res.json(result);
    } catch (err) {
        console.error('[Ritmonio Recon API] reconcileInvoiceManual Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getReconciliationReport = async (req, res) => {
    try {
        const report = await service.getReconciliationReport();
        res.json(report);
    } catch (err) {
        console.error('[Ritmonio Recon API] getReconciliationReport Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getReconciliationDetails = async (req, res) => {
    try {
        const details = await service.getReconciliationDetails(req.params.invoiceId);
        res.json(details);
    } catch (err) {
        console.error('[Ritmonio Recon API] getReconciliationDetails Error:', err);
        res.status(500).json({ error: err.message });
    }
};
