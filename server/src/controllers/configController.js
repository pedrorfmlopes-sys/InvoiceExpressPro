const ConfigService = require('../services/ConfigService');
const ProjectService = require('../services/ProjectService');
const fs = require('fs');

exports.getDocTypes = (req, res) => {
    try {
        const project = req.query.project;
        // Legacy priority: Project > Global
        // We use ConfigService or ProjectService context
        const ctx = ProjectService.getContext(project);
        if (fs.existsSync(ctx.files.doctypes)) {
            const data = JSON.parse(fs.readFileSync(ctx.files.doctypes, 'utf8'));
            return res.json(Array.isArray(data) ? data : (data.types || []));
        }

        // Fallback to global/default
        const defaults = ConfigService.getDocTypes(project);
        res.json(defaults);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getSecrets = async (req, res) => {
    try {
        const project = req.query.project;
        // Check ConfigService (now async)
        const secrets = await ConfigService.getSecrets(project); // Ensure await

        // Security Masking
        const masked = {
            openaiApiKeyPresent: !!secrets.openaiApiKey,
            openaiApiKeyMasked: secrets.openaiApiKey
                ? (secrets.openaiApiKey.substring(0, 3) + '...' + secrets.openaiApiKey.slice(-4))
                : null
        };

        res.json(masked);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
