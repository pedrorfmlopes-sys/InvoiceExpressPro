const service = require('./service');
const dto = require('./dto');
const { buildPDF } = require('../../../reports-pdf');
const exportController = require('../../controllers/exportController');
const DocService = require('../docs/service');
const { DEFAULTS } = require('../../config/constants');

// Helper for safe name extraction (Legacy)
const getName = (entity) => {
    if (!entity) return '—';
    if (typeof entity === 'string') return entity || '—';
    return entity.name || '—';
};

// Helper for number safety (Legacy)
const getNum = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

// Helper to normalize docs (Legacy)
const normalizeDocs = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.rows)) return raw.rows;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.docs)) return raw.docs;
    return [];
}

// Helper to handle standard V2 response
const respond = (res, rows, req) => {
    res.json(dto.toResponse(rows, req.query));
};

exports.getSummary = async (req, res) => {
    try {
        const rows = await service.getSummary(req.project);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getTopSuppliers = async (req, res) => {
    try {
        const limit = parseInt(req.query.topN) || 10;
        const rows = await service.getTopSuppliers(req.project, limit);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getTopCustomers = async (req, res) => {
    try {
        const limit = parseInt(req.query.topN) || 10;
        const rows = await service.getTopCustomers(req.project, limit);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getMonthlyTotals = async (req, res) => {
    try {
        const rows = await service.getMonthlyTotals(req.project);
        respond(res, rows, req);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.generatePdfBasic = async (req, res, next) => {
    try {
        // Reuse buildPDF but feed it with V2 aggregated data
        const project = req.project;

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
            const project = req.project;
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

// --- Legacy Methods (Merged) ---

exports.getSuppliers = async (req, res) => {
    try {
        const project = req.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
        const raw = await DocService.getDocs(project);
        const docs = normalizeDocs(raw);

        const map = new Map();
        docs.forEach(d => {
            const sName = getName(d.supplier);
            if (!map.has(sName)) map.set(sName, { Fornecedor: sName, key: sName, name: sName, count: 0, total: 0 });
            const s = map.get(sName);
            s.count++;
            s.total += getNum(d.total);
        });

        const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
        res.json({ rows, items: rows });
    } catch (e) {
        console.error('Reports Error:', e);
        res.status(500).json({ error: e.message, rows: [] });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const project = req.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
        const raw = await DocService.getDocs(project);
        const docs = normalizeDocs(raw);

        const map = new Map();
        docs.forEach(d => {
            const cName = getName(d.customer);
            if (!map.has(cName)) map.set(cName, { Cliente: cName, key: cName, name: cName, count: 0, total: 0 });
            const s = map.get(cName);
            s.count++;
            s.total += getNum(d.total);
        });

        const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
        res.json({ rows, items: rows });
    } catch (e) {
        console.error('Reports Error:', e);
        res.status(500).json({ error: e.message, rows: [] });
    }
};

exports.getMonthly = async (req, res) => {
    try {
        const project = req.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
        const raw = await DocService.getDocs(project);
        const docs = normalizeDocs(raw);

        const map = new Map();
        docs.forEach(d => {
            let key = 'unknown';
            if (d.date && typeof d.date === 'string') {
                if (d.date.length >= 7) key = d.date.slice(0, 7); // YYYY-MM
            }

            if (!map.has(key)) map.set(key, { month: key, key: key, count: 0, total: 0 });
            const item = map.get(key);
            item.count++;
            item.total += getNum(d.total);
        });

        const rows = Array.from(map.values()).sort((a, b) => {
            if (a.month === 'unknown') return 1;
            if (b.month === 'unknown') return -1;
            return a.month.localeCompare(b.month);
        });

        res.json({ rows, items: rows });
    } catch (e) {
        console.error('Reports Error:', e);
        res.status(500).json({ error: e.message, rows: [] });
    }
};

exports.generateLegacyProPdf = async (req, res) => {
    // Mock for Phase 3.1
    res.json({ message: 'Pro PDF Report Generated', project: req.project });
};
