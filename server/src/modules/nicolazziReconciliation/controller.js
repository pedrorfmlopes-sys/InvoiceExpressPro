const service = require('./service');

exports.reconcile = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.reconcileInvoice(id);
        res.json(result);
    } catch (error) {
        console.error('[Nicolazzi Recon] Error:', error);
        res.status(500).json({ error: error.message });
    }
};


exports.getReport = async (req, res) => {
    try {
        const report = await service.getReconciliationReport();
        res.json(report);
    } catch (error) {
        console.error('[Nicolazzi Recon Report] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await service.getReconciliationDetails(id);
        res.json(details);
    } catch (error) {
        console.error('[Nicolazzi Recon Details] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getProposalFulfillment = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await service.getProposalFulfillmentDetails(id);

        // If the service already caught an internal error and returned it
        if (details.error) {
            return res.status(200).json(details);
        }

        res.json(details);
    } catch (error) {
        console.error('[Nicolazzi Prop Fulfillment Controller] Error:', error);
        res.status(200).json({
            error: true,
            message: 'Erro interno no servidor: ' + error.message,
            proposal: { number: 'Erro' },
            stats: { progress: 0 },
            lines: []
        });
    }
};
