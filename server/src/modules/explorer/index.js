const express = require('express');
const router = express.Router();
const Service = require('./service');
const { requireAuth } = require('../../middlewares/auth');

// Middleware helper to extract common
const getProject = (req) => {
    // Allows Override via query 'project' if admin or cross-project
    // Default to req.ctx.project logic if strict? 
    // For Explorer, we often pass ?project=ALL or ?project=ID explicitly
    return req.query.project || (req.ctx.org ? 'ALL' : null);
};

// -- DOCS --
router.get('/docs', requireAuth, async (req, res) => {
    try {
        const result = await Service.getDocs(req.query.project, req.query);
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.patch('/doc/:id', requireAuth, async (req, res) => {
    try {
        const updated = await Service.updateDoc(req.params.id, req.query.project, req.body);
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/docs/bulk-delete', requireAuth, async (req, res) => {
    try {
        const { docIds } = req.body;
        if (!Array.isArray(docIds)) return res.status(400).json({ error: 'docIds must be array' });
        await Service.deleteDocs(docIds);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -- LINKS --
router.post('/links', requireAuth, async (req, res) => {
    try {
        const { docIds, groupId } = req.body;
        const result = await Service.linkDocs(docIds, groupId);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/links/:docId', requireAuth, async (req, res) => {
    try {
        const links = await Service.getLinks(req.params.docId);
        res.json(links);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/links/:docId', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.query;
        if (!groupId) return res.status(400).json({ error: 'Missing groupId' });
        await Service.unlinkDoc(req.params.docId, groupId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -- AUX (SubProjects, Categories) --
router.get('/subprojects', requireAuth, async (req, res) => {
    try {
        const list = await Service.getSubProjects(req.query.project);
        res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/subprojects', requireAuth, async (req, res) => {
    try {
        const item = await Service.createSubProject(req.body);
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories', requireAuth, async (req, res) => {
    try {
        const list = await Service.getCategories(req.query.project);
        res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categories', requireAuth, async (req, res) => {
    try {
        const item = await Service.createCategory(req.body);
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- PREFS --
router.get('/prefs/:key', requireAuth, async (req, res) => {
    try {
        const val = await Service.getPrefs(req.ctx.user.id, req.query.project, req.params.key);
        // Return default empty obj if null to save frontend logic
        res.json(val || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/prefs/:key', requireAuth, async (req, res) => {
    try {
        const val = await Service.setPrefs(req.ctx.user.id, req.query.project, req.params.key, req.body);
        res.json(val);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
