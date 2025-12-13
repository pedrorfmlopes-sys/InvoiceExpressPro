// server/src/controllers/docController.js
const DocService = require('../services/DocService');

exports.updateDoc = async (req, res) => {
    try {
        const project = req.query.project;
        const { id } = req.params;
        const row = await DocService.updateDoc(project, id, req.body);
        res.json({ ok: true, row });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteDoc = async (req, res) => {
    try {
        const project = req.query.project;
        const { id } = req.params;
        await DocService.deleteDoc(project, id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.finalizeDoc = async (req, res) => {
    try {
        const project = req.query.project;
        const row = await DocService.finalizeDoc(project, req.body);
        res.json({ ok: true, row });
    } catch (e) {
        console.error(e);
        res.status(e.message.includes('not found') ? 404 : 409).json({ error: e.message });
    }
};

exports.finalizeBulk = async (req, res) => {
    const project = req.query.project;
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items[] required' });

    const results = [];
    for (const it of items) {
        try {
            const r = await DocService.finalizeDoc(project, it);
            results.push({ id: it.id, ok: true, row: r });
        } catch (e) {
            results.push({ id: it.id, ok: false, error: e.message });
        }
    }
    res.json({ ok: true, results });
};

exports.viewDoc = async (req, res) => {
    // Stream PDF
    const fs = require('fs');
    const project = req.query.project;
    const { id } = req.query; // Only ID supported for simplicity of Phase 1

    try {
        const doc = await DocService.getDoc(project, id);
        if (!doc || !doc.filePath || !fs.existsSync(doc.filePath)) return res.status(404).json({ error: 'File not found' });
        res.setHeader('Content-Type', 'application/pdf');
        fs.createReadStream(doc.filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getExcelJson = async (req, res) => {
    // Mimic /api/excel.json which returns all docs
    try {
        const rows = await DocService.getDocs(req.query.project);
        res.json({ rows, excelPath: 'docs.json' });
    } catch (e) {
        res.json({ rows: [], error: e.message });
    }
}
