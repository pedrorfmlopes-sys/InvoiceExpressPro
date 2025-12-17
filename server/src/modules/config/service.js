const fs = require('fs');
const path = require('path');

const getDataPath = (project) => path.join(process.cwd(), 'data', project || 'default', 'config');

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const getSecretsPath = (project) => {
    const dir = getDataPath(project);
    ensureDir(dir);
    return path.join(dir, 'secrets.json');
};

const getDocTypesPath = (project) => {
    const dir = getDataPath(project);
    ensureDir(dir);
    return path.join(dir, 'doctypes.json');
};

const readJson = (filePath, defaults = {}) => {
    try {
        if (!fs.existsSync(filePath)) return defaults;
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`[ConfigService] Error reading ${filePath}:`, err.message);
        return defaults;
    }
};

const writeJson = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Secrets
exports.getSecrets = (project) => {
    return readJson(getSecretsPath(project), { openai_key: '' });
};

exports.saveSecrets = (project, newSecrets) => {
    const current = exports.getSecrets(project);
    const updated = { ...current, ...newSecrets };
    writeJson(getSecretsPath(project), updated);
    return updated;
};

// DocTypes
exports.getDocTypes = (project) => {
    // Defaults matching ConfigTab.jsx placeholder or reasonable defaults
    const DEFAULT_TYPES = { items: ['Fatura', 'Encomenda', 'Proposta', 'Recibo', 'NotaCredito', 'Documento'] };
    // UI expects list or { items: [] }? ConfigTab.jsx: "const arr = Array.isArray(j) ? j : (j.items || [])"
    // We will save as { items: [...] } for extensibility
    const data = readJson(getDocTypesPath(project), DEFAULT_TYPES);
    // Compatibility: if array, wrap it
    if (Array.isArray(data)) return { items: data };
    if (!data.items) return DEFAULT_TYPES;
    return data;
};

exports.saveDocTypes = (project, items) => {
    const data = { items: Array.isArray(items) ? items : [] };
    writeJson(getDocTypesPath(project), data);
    return data;
};
