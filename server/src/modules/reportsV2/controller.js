const service = require('./service');
const dto = require('./dto');
const { buildPDF } = require('../../../reports-pdf'); // Reuse V1 PDF Engine

// Helper to handle standard V2 response
const respond = (res, rows, req) => {
    res.json(dto.toResponse(rows, req.query));
};

exports.getSummary = async (req, res) => {
    try {
        const rows = await service.getSummary(req.query.project);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getTopSuppliers = async (req, res) => {
    try {
        const limit = parseInt(req.query.topN) || 10;
        const rows = await service.getTopSuppliers(req.query.project, limit);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getTopCustomers = async (req, res) => {
    try {
        const limit = parseInt(req.query.topN) || 10;
        const rows = await service.getTopCustomers(req.query.project, limit);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getMonthlyTotals = async (req, res) => {
    try {
        const rows = await service.getMonthlyTotals(req.query.project);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.generatePdfBasic = async (req, res, next) => {
    try {
        // Reuse buildPDF but feed it with V2 aggregated data
        const project = req.query.project;

        const [suppliers, customers, monthly] = await Promise.all([
            service.getTopSuppliers(project, 20),
            service.getTopCustomers(project, 20),
            service.getMonthlyTotals(project)
        ]);

        // Map fields to what buildPDF expects (Legacy contract adaptation)
        // buildPDF expects: { Fornecedor, count, sum } etc.
        // V2 service returns: { name, count, total }

        const adapt = (rows, nameField) => rows.map(r => ({
            [nameField]: r.name,
            sum: r.total,
            count: r.count,
            month: r.month // for monthly
        }));

        const pdfBuffer = await buildPDF({
            title: 'Relatório V2 (Modular)',
            suppliers: adapt(suppliers, 'Fornecedor'),
            customers: adapt(customers, 'Cliente'),
            monthly: adapt(monthly, 'Mês'),
            analysis: 'Gerado via API V2'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=report_v2_${Date.now()}.pdf`);
        res.send(pdfBuffer);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.generatePdfPro = async (req, res) => {
    res.status(501).json({ error: 'Pro PDF not configured (Phase 3.1 placeholder)' });
};
