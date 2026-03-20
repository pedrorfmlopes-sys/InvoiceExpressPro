const ScarabeoReconciliationService = require('./service');

class ScarabeoReconciliationController {
    async reconcile(req, res) {
        try {
            const { invoiceId, proposalId } = req.body;
            if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
            
            const result = await ScarabeoReconciliationService.reconcileInvoice(invoiceId, proposalId);
            res.json(result);
        } catch (error) {
            console.error('[ScarabeoReconController] Reconcile Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async discover(req, res) {
        try {
            const matches = await ScarabeoReconciliationService.discoverMatches();
            res.json(matches);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getReport(req, res) {
        try {
            const report = await ScarabeoReconciliationService.getReconciliationReport();
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDetails(req, res) {
        try {
            const { invoiceId } = req.params;
            const details = await ScarabeoReconciliationService.getReconciliationDetails(invoiceId);
            res.json(details);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ScarabeoReconciliationController();
