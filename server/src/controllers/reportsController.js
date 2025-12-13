const DocService = require('../services/DocService');
const { buildPDF } = require('../../reports-pdf'); // adjust path if needed: reports-pdf is in server root
const path = require('path');

exports.getSuppliers = async (req, res) => {
    try {
        const project = req.query.project;
        const docs = await DocService.getDocs(project);

        // Aggregate
        const map = new Map();
        docs.forEach(d => {
            const name = typeof d.supplier === 'object' ? d.supplier.name : d.supplier;
            const sName = name || 'N/A';
            if (!map.has(sName)) map.set(sName, { name: sName, count: 0, sum: 0 });
            const s = map.get(sName);
            s.count++;
            s.sum += Number(d.total || 0);
        });

        const items = Array.from(map.values()).sort((a, b) => b.sum - a.sum);
        res.json({ items });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Implement monthly or general report if needed based on smoke test usage patterns, but user only asked for parity on broken endpoints.
