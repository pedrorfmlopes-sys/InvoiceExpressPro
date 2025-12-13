// server/src/utils/helpers.js
const fs = require('fs');
const path = require('path');

function sanitize(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function ensureFile(p, content) {
    if (!fs.existsSync(p)) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
    }
}

function normalizeDate(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{1,2})[\/\.\-\s](\d{1,2})[\/\.\-\s](\d{4})$/);
    if (!m) return s;
    const [, d, mo, y] = m;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toNumberEU(s) {
    if (!s) return 0;
    return Number(String(s).replace(/\./g, '').replace(',', '.').replace(/\s/g, '')) || 0;
}

function coercePartyToString(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
        // Tentar extrair propriedades comuns
        return v.name || v.designacao || v.label || JSON.stringify(v);
    }
    return String(v);
}

function safeCsv(s) {
    const t = String(s || '');
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

module.exports = {
    sanitize,
    ensureFile,
    normalizeDate,
    toNumberEU,
    coercePartyToString,
    safeCsv
};
