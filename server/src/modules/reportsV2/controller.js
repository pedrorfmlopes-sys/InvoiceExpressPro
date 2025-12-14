const service = require('./service');
const dto = require('./dto');
const { buildPDF } = require('../../../reports-pdf'); // Reuse V1 PDF Engine
const exportController = require('../../controllers/exportController');

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

exports.exportData = async (req, res, next) => {
    const format = (req.query.format || 'xlsx').toLowerCase();

    if (format === 'xlsx') {
        return exportController.exportXlsx(req, res, next);
    }

    if (format === 'csv') {
        try {
            const project = req.query.project;
            const docs = await service.fetchDocs(project);

            // Columns: id, docType, docNumber, date, supplier, customer, total, status, origName, project
            const headers = ['id', 'docType', 'docNumber', 'date', 'supplier', 'customer', 'total', 'status', 'origName', 'project'];

            const escape = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const csvRows = docs.map(d => {
                const supplierName = (d.supplier && typeof d.supplier === 'object') ? (d.supplier.name || '') : (d.supplier || '');
                const customerName = (d.customer && typeof d.customer === 'object') ? (d.customer.name || '') : (d.customer || '');

                return [
                    d.id,
                    d.docType,
                    d.docNumber,
                    d.date,
                    supplierName,
                    customerName,
                    d.total,
                    d.status,
                    d.origName,
                    d.project
                ].map(escape).join(',');
            });

            const csvContent = [headers.join(','), ...csvRows].join('\n');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `reports_export_${project || 'default'}_${dateStr}.csv`;

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csvContent);

        } catch (e) {
            console.error('[Export CSV Error]', e);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(400).json({ error: 'Unsupported format' });
};
