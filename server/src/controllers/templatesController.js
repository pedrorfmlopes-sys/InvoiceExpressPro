const ProjectService = require('../services/ProjectService');
const fs = require('fs');
const path = require('path');

exports.getTemplates = (req, res) => {
    try {
        const project = req.query.project;
        const ctx = ProjectService.getContext(project);

        if (!fs.existsSync(ctx.dirs.templates)) {
            return res.json([]);
        }

        const files = fs.readdirSync(ctx.dirs.templates)
            .filter(f => !f.startsWith('.'))
            .map(f => ({
                name: f,
                path: path.join(ctx.dirs.templates, f)
            }));

        res.json(files);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
