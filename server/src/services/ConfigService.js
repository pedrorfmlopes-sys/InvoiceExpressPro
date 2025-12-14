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

    async getDocTypes(projectId) {
        // 1. Try Adapter (DB)
        if (Adapter.getDocTypes) {
            return await Adapter.getDocTypes(projectId);
        }

        // 2. Try File (JSON)
        // For now, we use a per-project file if possible, or global
        // In simple JSON mode, let's store in project dir or global config
        // Let's use global for simplicity if project is not strictly separated in FS (or try both)
        const customPath = path.join(PATHS.CONFIG, `doctypes-${projectId}.json`);
        if (fs.existsSync(customPath)) {
            try {
                return JSON.parse(fs.readFileSync(customPath, 'utf8'));
            } catch (e) { console.error('Error reading doctypes', e); }
        }

        // 3. Defaults
        return [
            {
                id: "fatura",
                labelPt: "Fatura",
                synonyms: ["Fattura", "Invoice", "Factura", "FT", "Fatura"],
                keywords: ["fattura", "invoice", "fatura"]
            },
            {
                id: "recibo",
                labelPt: "Recibo",
                synonyms: ["Receipt", "Ricevuta", "Payment", "RC", "Recibo"],
                keywords: ["recibo", "ricevuta", "receipt"]
            },
            {
                id: "nota_credito",
                labelPt: "Nota de Crédito",
                synonyms: ["Credit Note", "Nota di credito", "NC", "Nota de Credito"],
                keywords: ["nota de crédito", "credit note", "nota di credito"]
            },
            {
                id: "guia_remessa",
                labelPt: "Guia de Remessa",
                synonyms: ["DDT", "Delivery Note", "Bolla", "Guia", "GR"],
                keywords: ["ddt", "guia", "delivery note", "bolla"]
            },
            {
                id: "fatura_recibo",
                labelPt: "Fatura-Recibo",
                synonyms: ["Cash Invoice", "FR"],
                keywords: ["fatura-recibo", "pronto pagamento"]
            }
        ];
    }

    async saveDocTypes(projectId, types) {
        if (Adapter.saveDocTypes) {
            return await Adapter.saveDocTypes(projectId, types);
        }
        // File mode
        const customPath = path.join(PATHS.CONFIG, `doctypes-${projectId}.json`);
        fs.writeFileSync(customPath, JSON.stringify(types, null, 2));
    }

    // App Logo logic could go here or in ProjectService
    saveAppLogo(projectId, buffer) {
        const p = path.join(PATHS.PROJECTS, projectId, 'app-logo.png');
        fs.writeFileSync(p, buffer);
        return p;
    }
}

module.exports = new ConfigService();
