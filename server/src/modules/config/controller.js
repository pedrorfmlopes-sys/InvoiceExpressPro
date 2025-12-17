const service = require('./service');

// Secrets
exports.getSecrets = (req, res) => {
    try {
        const project = req.project; // Provided by attachProjectContext
        const secrets = service.getSecrets(project);

        // Masking logic for UI
        const masked = { ...secrets };
        if (masked.openai_key && masked.openai_key.length > 8) {
            masked.openai_key = masked.openai_key.substring(0, 3) + '...' + masked.openai_key.substring(masked.openai_key.length - 4);
        } else if (masked.openai_key) {
            masked.openai_key = '***';
        }

        // Return format matching generic "secrets" or specific for ConfigTab?
        // ConfigTab expects: { hasApiKey: bool, maskedKey: string } per loadSecrets logic
        // "const j = ... then r.data; if (j.hasApiKey && j.maskedKey) ... "
        // But ConfigTab.jsx ALSO does: `const j = ...` and checks `hasApiKey`.
        // Wait, ConfigTab loadSecrets: 
        // `const j = await api.get('/api/config/secrets').then(r => r.data);`
        // `if (j.hasApiKey && j.maskedKey) setKey(j.maskedKey);`

        // We should return what UI expects.
        // Also original request mentioned "openai_key".
        // Let's analyze ConfigTab.jsx logic again?
        // It sets local state `key`. 
        // If we only populate hasApiKey/maskedKey, the UI will use maskedKey.

        res.json({
            hasApiKey: !!secrets.openai_key,
            maskedKey: masked.openai_key || '',
            // We also return full object just in case other tabs need props, but filtered? 
            // For security, only return masked stuff.
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.saveSecrets = (req, res) => {
    try {
        const project = req.project;
        const { apiKey } = req.body; // ConfigTab sends { apiKey: '...' }

        if (apiKey === undefined) {
            return res.status(400).json({ error: 'Missing apiKey' });
        }

        const current = service.getSecrets(project);

        // If apiKey is masking string, ignore (or don't save). 
        // ConfigTab: "if (key.includes('...')) { alert('Chave já guardada...'); return; }" -> UI prevents sending masked key.
        // So we can assume if we get it, it's new.

        let newSecrets = {};
        if (apiKey === '') {
            newSecrets = { openai_key: '' };
        } else {
            newSecrets = { openai_key: apiKey };
        }

        service.saveSecrets(project, newSecrets);

        // Return OK
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// DocTypes
exports.getDocTypes = (req, res) => {
    try {
        const project = req.project;
        const data = service.getDocTypes(project);
        res.json(data); // returns { items: [...] }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveDocTypes = (req, res) => {
    try {
        const project = req.project;
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be array' });

        service.saveDocTypes(project, items);
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
