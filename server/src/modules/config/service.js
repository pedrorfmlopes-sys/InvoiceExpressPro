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

const getUIPath = (project) => {
    const dir = getDataPath(project);
    ensureDir(dir);
    return path.join(dir, 'ui_preferences.json');
};

exports.getUIPreferences = (project) => {
    return readJson(getUIPath(project), { sidebar: {}, card: {} });
};

exports.saveUIPreferences = (project, prefs) => {
    let current = exports.getUIPreferences(project);
    // Deep merge or replace? Replace sections is safer to avoid stale deletions.
    if (prefs.sidebar) current.sidebar = { ...current.sidebar, ...prefs.sidebar };
    if (prefs.card) current.card = { ...current.card, ...prefs.card };

    writeJson(getUIPath(project), current);
    return current;
};

// --- DB Settings (Project) ---
exports.getSettings = (project) => {
    return DbDocsAdapter.getSettings(project);
};

exports.saveSettings = (project, settings) => {
    return DbDocsAdapter.saveSettings(project, settings);
};

// --- Cleanup (Dangerous) ---
const DbDocsAdapter = require('../../storage/DbDocsAdapter');
const ProjectService = require('../../services/ProjectService');

exports.resetProjectData = async (project) => {
    // 1. DB Cleanup
    await DbDocsAdapter.resetProjectData(project);

    // 2. File Cleanup (Staging/Archive)
    const ctx = ProjectService.getContext(project);
    try {
        // We delete contents of staging/archive but verify paths first
        const emptyDir = (dir) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
            }
        };
        emptyDir(ctx.dirs.staging);
        emptyDir(ctx.dirs.archive);
    } catch (e) {
        console.error("Error cleaning files:", e);
        // Continue, non-fatal
    }
    return true;
};

exports.deleteProject = async (project) => {
    // 1. Reset Data first
    await exports.resetProjectData(project);

    // 2. Delete Project Config/Folder
    return ProjectService.deleteProject(project);
};
