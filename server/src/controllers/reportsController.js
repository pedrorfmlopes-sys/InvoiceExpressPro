const DocService = require('../services/DocService');
const { buildPDF } = require('../../reports-pdf');
const path = require('path');
const { DEFAULTS } = require('../config/constants');

// Helper for safe name extraction
const getName = (entity) => {
    if (!entity) return '—';
    if (typeof entity === 'string') return entity || '—';
    return entity.name || '—';
};

// Helper for number safety
const getNum = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

// Helper to normalize docs (Fixes V3.0 regression)
const normalizeDocs = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.rows)) return raw.rows;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.docs)) return raw.docs;
    return [];
}

exports.getSuppliers = async (req, res) => {
    try {
        console.log('[Reports] DEFAULTS:', DEFAULTS);
        const project = req.query.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
        console.log('[Reports] Resolved project:', project);

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

        // Return { rows } as requested (and items for backwards compat if any)
        res.json({ rows, items: rows });
    } catch (e) {
        console.error('Reports Error:', e);
        res.status(500).json({ error: e.message, rows: [] });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const project = req.query.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
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
        const project = req.query.project || (DEFAULTS && DEFAULTS.PROJECT) || 'default';
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

        // Sort by month ascending, unknown last
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
