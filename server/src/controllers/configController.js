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
exports.setSecrets = async (req, res) => {
    try {
        const project = req.query.project || 'default';
        const { apiKey } = req.body;

        // Allow explicitly setting empty string to clear it, but reject undefined if needed.
        // Frontend sends { apiKey: '' } to clear.
        if (apiKey === undefined) {
            return res.status(400).json({ error: 'Missing apiKey field' });
        }

        // We map frontend 'apiKey' to storage 'openaiApiKey'
        const secrets = { openaiApiKey: apiKey };

        await ConfigService.saveSecrets(project, secrets);

        // Return masked version
        const masked = {
            openaiApiKeyPresent: !!apiKey,
            openaiApiKeyMasked: apiKey
                ? (apiKey.substring(0, 3) + '...' + apiKey.slice(-4))
                : null
        };

        res.json(masked);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.setDocTypes = (req, res) => {
    try {
        const project = req.query.project;
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

        const fs = require('fs');
        const ProjectService = require('../services/ProjectService');
        const ctx = ProjectService.getContext(project);

        const data = { types: items };
        fs.writeFileSync(ctx.files.doctypes, JSON.stringify(data, null, 2));

        res.json({ ok: true, count: items.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.uploadLogo = (req, res) => {
    try {
        const project = req.query.project;
        const { dataUrl } = req.body;
        if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' });

        const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid dataUrl' });
        }

        const buffer = Buffer.from(matches[2], 'base64');
        const ConfigService = require('../services/ConfigService');
        if (ConfigService.saveAppLogo) {
            ConfigService.saveAppLogo(project, buffer);
        } else {
            const fs = require('fs');
            const p = require('path');
            const ProjectService = require('../services/ProjectService');
            const ctx = ProjectService.getContext(project);
            fs.writeFileSync(p.join(ctx.dirs.base, 'app-logo.png'), buffer);
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
