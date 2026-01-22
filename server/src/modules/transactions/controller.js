const TransactionService = require('../../services/TransactionService');

exports.create = async (req, res) => {
    try {
        const project = req.project || 'default';
        const tx = await TransactionService.createTransaction(project, req.body);
        res.json({ ok: true, transaction: tx });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.list = async (req, res) => {
    try {
        const project = req.project || 'default';
        const rows = await TransactionService.listTransactions(project, req.query);
        res.json({ ok: true, rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
    try {
        const project = req.project || 'default';
        const tx = await TransactionService.getTransaction(project, req.params.id);
        res.json({ ok: true, transaction: tx });
    } catch (e) { res.status(404).json({ error: e.message }); }
};

exports.addDocs = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { docIds, role } = req.body;
        if (!Array.isArray(docIds)) throw new Error('docIds array required');

        for (const docId of docIds) {
            await TransactionService.addDocument(project, req.params.id, docId, role);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.removeDoc = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { docId } = req.body;
        await TransactionService.removeDocument(project, req.params.id, docId);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.suggest = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { docId } = req.body;
        const suggestions = await TransactionService.suggestLinks(project, docId);
        res.json({ ok: true, suggestions });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
