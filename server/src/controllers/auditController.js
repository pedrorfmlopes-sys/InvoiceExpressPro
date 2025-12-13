const ProjectService = require('../services/ProjectService');
const fs = require('fs');

exports.getAudit = (req, res) => {
    try {
        const project = req.query.project;
        const ctx = ProjectService.getContext(project);

        if (fs.existsSync(ctx.files.audit)) {
            const data = fs.readFileSync(ctx.files.audit, 'utf8');
            // Check if it's JSON or line-based
            try {
                const json = JSON.parse(data);
                return res.json(Array.isArray(json) ? json : [json]);
            } catch {
                // Return as text lines wrapped in object if not valid JSON
                const lines = data.split('\n').filter(l => l.trim().length > 0);
                return res.json(lines.map(l => ({ msg: l })));
            }
        }
        res.json([]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
