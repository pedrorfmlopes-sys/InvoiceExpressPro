const Service = require('./service');

// -- Nodes --

exports.listNodes = async (req, res) => {
    try {
        const nodes = await Service.listNodes(req.query);
        res.json(nodes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createNode = async (req, res) => {
    try {
        const { parentId, ...rest } = req.body;
        const data = {
            ...rest,
            parent_id: parentId,
            created_by: req.ctx?.user?.id
        };
        const node = await Service.createNode(data);
        res.json(node);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.updateNode = async (req, res) => {
    try {
        const { id } = req.params;
        const node = await Service.updateNode(id, req.body);
        res.json(node);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.moveNode = async (req, res) => {
    try {
        const { id } = req.params;
        const { parentId } = req.body; // Can be null
        const node = await Service.moveNode(id, parentId);
        res.json(node);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.getPath = async (req, res) => {
    try {
        const { id } = req.params;
        const path = await Service.getPath(id);
        res.json(path);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// -- Links --

exports.getLinks = async (req, res) => {
    try {
        const { nodeId } = req.params;
        const links = await Service.getLinks(nodeId);
        res.json(links);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createLink = async (req, res) => {
    try {
        const { from, to, type } = req.body;
        const link = await Service.addLink(from, to, type);
        res.json(link);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.deleteLink = async (req, res) => {
    try {
        const { from, to, type } = req.body;
        await Service.removeLink(from, to, type);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

// -- Docs --

exports.getDocs = async (req, res) => {
    try {
        const { id } = req.params;
        const docs = await Service.getDocs(id);
        res.json(docs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.setDocs = async (req, res) => { // Replace strategy
    try {
        const { id } = req.params;
        const { docIds } = req.body;
        const docs = await Service.setDocLinks(id, docIds);
        res.json(docs);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.addDoc = async (req, res) => { // Append strategy
    try {
        const { id } = req.params;
        const { docId } = req.body;
        const link = await Service.addDocLink(id, docId);
        res.json(link);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.removeDoc = async (req, res) => {
    try {
        const { id, docId } = req.params;
        await Service.removeDocLink(id, docId);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

// -- Search --

exports.search = async (req, res) => {
    try {
        const { q } = req.query;
        const results = await Service.searchNodes(q);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.searchByDoc = async (req, res) => {
    try {
        const { q } = req.query;
        const results = await Service.searchByDoc(q);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
