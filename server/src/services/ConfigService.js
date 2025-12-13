// server/src/services/ConfigService.js
const fs = require('fs');
const Adapter = require('../storage/getDocsAdapter');
const path = require('path');
const { PATHS } = require('../config/constants');

const FILE_SECRETS = path.join(PATHS.CONFIG, 'secrets.json');
const FILE_DOCTYPES_GLOBAL = path.join(PATHS.CONFIG, 'doctypes.json');

class ConfigService {
    async getSecrets(project) {
        // Phase 2: Use Adapter if supported (Adapter.getSecrets might be DB only, verify Json logic)
        // If Adapter has getSecrets, use it (DB mode)
        if (Adapter.getSecrets) {
            const s = await Adapter.getSecrets(project);
            return s || {};
        }

        // Fallback or JSON Adapter legacy behavior (using FILE_SECRETS constant)
        try {
            if (!fs.existsSync(FILE_SECRETS)) return {};
            return JSON.parse(fs.readFileSync(FILE_SECRETS, 'utf8'));
        } catch { return {}; }
    }

    async saveSecrets(project, secrets) {
        if (Adapter.saveSecrets) {
            await Adapter.saveSecrets(project, secrets);
        } else {
            fs.writeFileSync(FILE_SECRETS, JSON.stringify(secrets, null, 2));
        }
    }

    getDocTypes(projectId) { // Not fully using projectId yet as per legacy global fallback
        // Try project
        // But legacy fallback is hardcoded defaults + global check
        // We'll mimic strict legacy behavior
        const defaults = ["Fatura", "Recibo", "Nota de Crédito", "Guia de Remessa"];
        return defaults;
    }

    // App Logo logic could go here or in ProjectService
    saveAppLogo(projectId, buffer) {
        const p = path.join(PATHS.PROJECTS, projectId, 'app-logo.png');
        fs.writeFileSync(p, buffer);
        return p;
    }
}

module.exports = new ConfigService();
