const Service = require('./service');

// -- Labels Management --

exports.getLabels = async (req, res) => {
    try {
        // Project ID from query or context?
        // Assuming user context restricts view, or param?
        // Service expects projectId or 'ALL'.
        // Let's use req.query.project. If missing, maybe use context or default?
        // For security, non-admins should only see their project + global?
        // Let's assume simpler mode: pass project ID.
        // query params might contain filters
        const filters = req.query; // { project, archived }
        const labels = await Service.getLabels(filters.project, filters);
        res.json(labels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createLabel = async (req, res) => {
    try {
        const data = {
            ...req.body,
            created_by: req.ctx?.user?.id
        };
        const label = await Service.createLabel(data);
        res.json(label);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.updateLabel = async (req, res) => {
    try {
        const { id } = req.params;
        const label = await Service.updateLabel(id, req.body);
        res.json(label);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.deleteLabel = async (req, res) => {
    try {
        const { id } = req.params;
        await Service.deleteLabel(id);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

// -- Doc Assignment --

exports.getDocLabels = async (req, res) => {
    try {
        const { docId } = req.params;
        const labels = await Service.getDocLabels(docId);
        res.json(labels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.setDocLabels = async (req, res) => {
    try {
        const { docId } = req.params;
        const { labelIds } = req.body; // Expect array
        const result = await Service.setDocLabels(docId, labelIds);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.getNodeLabels = async (req, res) => {
    try {
        const { nodeId } = req.params;
        const labels = await Service.getNodeLabels(nodeId);
        res.json(labels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.setNodeLabels = async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { labelIds } = req.body;
        const result = await Service.setNodeLabels(nodeId, labelIds);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};
