const service = require('./service');
const FulfillmentExporter = require('./FulfillmentExporter');

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

exports.unlink = async (req, res) => {
    try {
        const { id } = req.params;
        await service.unlinkInvoice(id);
        res.json({ ok: true });
    } catch (error) {
        console.error('[Nicolazzi Recon Unlink] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.discoverMatches = async (req, res) => {
    try {
        const matches = await service.discoverMatches();
        res.json(matches);
    } catch (error) {
        console.error('[Nicolazzi Recon Discover] Error:', error);
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

exports.exportReport = async (req, res) => {
    try {
        const { proposalIds } = req.body;
        if (!proposalIds || !Array.isArray(proposalIds) || proposalIds.length === 0) {
            return res.status(400).json({ error: 'Nenhuma proposta selecionada.' });
        }

        const buffer = await service.exportReconciliationExcel(proposalIds);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=status_encomendas.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('[Nicolazzi Recon Export] Error:', error);
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
        console.error('[Nicolazzi Prop Fulfillment] API Error:', error);
        // Ensure returning a valid object structure
        res.status(500).json({
            error: true,
            message: error.message,
            stack: error.stack,
            proposal: { number: 'Error' },
            stats: { progress: 0 },
            lines: [],
            documents: []
        });
    }
};

exports.exportFulfillmentPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await service.getProposalFulfillmentDetails(id);

        if (!details || details.error) {
            return res.status(500).json({ error: 'Erro ao extrair dados para o PDF' });
        }

        const buffer = await FulfillmentExporter.generatePdf(details);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=status_${details.proposal?.number || 'encomenda'}.pdf`);
        res.send(buffer);
    } catch (error) {
        console.error('[Nicolazzi Recon PDF] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.exportFulfillmentPdfMultiple = async (req, res) => {
    try {
        const { proposalIds } = req.body;
        if (!proposalIds || !Array.isArray(proposalIds) || proposalIds.length === 0) {
            return res.status(400).json({ error: 'Nenhuma proposta selecionada para PDF.' });
        }

        const buffer = await FulfillmentExporter.generateMultiPdf(proposalIds);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_status_multiplo.pdf`);
        res.send(buffer);
    } catch (error) {
        console.error('[Nicolazzi Recon Multi-PDF] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const data = await service.getAnalytics();
        res.json(data);
    } catch (error) {
        console.error('[Nicolazzi Analytics] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.exportLateItemsExcel = async (req, res) => {
    try {
        const buffer = await service.exportLateItemsExcel();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=nicolazzi_artigos_atraso.xlsx`);
        res.send(buffer);
    } catch (error) {
        console.error('[Nicolazzi Late Items Export] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
