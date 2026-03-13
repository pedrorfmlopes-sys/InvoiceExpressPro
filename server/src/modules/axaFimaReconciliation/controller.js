const service = require('./service');

exports.reconcileOc = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.reconcileOrderConfirmation(id);
        res.json(result);
    } catch (error) {
        console.error('[AxaFima Recon OC] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.reconcileOcManual = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.reconcileOrderConfirmation(id, req.body.proposal_id);
        res.json(result);
    } catch (error) {
        console.error('[AxaFima Recon OC Manual] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.reconcileInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.reconcileInvoice(id);
        res.json(result);
    } catch (error) {
        console.error('[AxaFima Recon Invoice] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.reconcileInvoiceManual = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.reconcileInvoice(id, req.body.proposal_id);
        res.json(result);
    } catch (error) {
        console.error('[AxaFima Recon Invoice Manual] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.unlink = async (req, res) => {
    try {
        const { id } = req.params;
        await service.unlinkDocument(id);
        res.json({ ok: true });
    } catch (error) {
        console.error('[AxaFima Recon Unlink] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getReport = async (req, res) => {
    try {
        const report = await service.getReconciliationReport();
        res.json(report);
    } catch (error) {
        console.error('[AxaFima Recon Report] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.discoverInvoices = async (req, res) => {
    try {
        const matches = await service.discoverMatches();
        res.json(matches);
    } catch (error) {
        console.error('[AxaFima Discover Invoices] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.discoverOcs = async (req, res) => {
    try {
        const matches = await service.discoverOcMatches();
        res.json(matches);
    } catch (error) {
        console.error('[AxaFima Discover OCs] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.resetAllMatchings = async (req, res) => {
    try {
        const result = await service.resetAllMatchings();
        res.json(result);
    } catch (err) {
        console.error('[AxaFima Reset] Error:', err);
        res.status(500).json({ error: err.message });
    }
};
