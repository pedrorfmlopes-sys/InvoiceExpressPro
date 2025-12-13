// server/src/storage/JsonDocsAdapter.js
const fs = require('fs');
const path = require('path');
const DbAdapter = require('../adapters/DbAdapter');
const { PATHS } = require('../config/constants');
const { ensureFile, normalizeDate, toNumberEU, coercePartyToString } = require('../utils/helpers');
const Mutex = require('../utils/Mutex');
const logger = require('../utils/logger');

// Global locks map (project -> mutex)
const locks = new Map();

function getMutex(projectId) {
    if (!locks.has(projectId)) {
        locks.set(projectId, new Mutex());
    }
    return locks.get(projectId);
}

class JsonDocsAdapter extends DbAdapter {
    constructor() {
        super();
    }

    _getProjectPaths(projectId) {
        const base = path.join(PATHS.PROJECTS, projectId || 'default');
        return {
            base,
            docs: path.join(base, 'docs.json'),
            audit: path.join(base, 'audit.json'),
            config: path.join(base, 'config'), // Legacy location references
        };
    }

    _ensureDb(paths) {
        ensureFile(paths.docs, JSON.stringify({ rows: [] }, null, 2));
        ensureFile(paths.audit, '[]');
    }

    _readDocs(paths) {
        try {
            if (!fs.existsSync(paths.docs)) return { rows: [] };
            return JSON.parse(fs.readFileSync(paths.docs, 'utf8'));
        } catch (e) {
            logger.error(`Error reading docs.json: ${e.message}`);
            return { rows: [] };
        }
    }

    async getDocuments(projectId, filters = {}) {
        const paths = this._getProjectPaths(projectId);
        this._ensureDb(paths);

        // Read is safe without lock usually, but for strict consistency could lock.
        // We will lock only writes for performance in Phase 1, assuming low concurrency reads.
        const db = this._readDocs(paths);
        let rows = db.rows || [];

        // Basic filtering here or in Service? Adapter should mostly allow raw access or basic filtering.
        // For now returning all, Service applies logic.
        return rows;
    }

    async getDocumentById(projectId, id) {
        const rows = await this.getDocuments(projectId);
        return rows.find(r => r.id === id);
    }

    async saveDocument(projectId, doc) {
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            const db = this._readDocs(paths);
            db.rows = db.rows || [];

            const idx = db.rows.findIndex(r => r.id === doc.id);
            if (idx >= 0) {
                db.rows[idx] = doc;
            } else {
                db.rows.push(doc);
            }

            fs.writeFileSync(paths.docs, JSON.stringify(db, null, 2));
            return doc;
        });
    }

    async updateDocument(projectId, id, updates) {
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            const db = this._readDocs(paths);
            db.rows = db.rows || [];

            const idx = db.rows.findIndex(r => r.id === id);
            if (idx === -1) throw new Error('Document not found');

            db.rows[idx] = { ...db.rows[idx], ...updates };
            fs.writeFileSync(paths.docs, JSON.stringify(db, null, 2));
            return db.rows[idx];
        });
    }

    async deleteDocument(projectId, id) {
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            const db = this._readDocs(paths);
            db.rows = db.rows || [];

            const idx = db.rows.findIndex(r => r.id === id);
            if (idx === -1) return false;

            const deleted = db.rows[idx];
            db.rows.splice(idx, 1);

            fs.writeFileSync(paths.docs, JSON.stringify(db, null, 2));
            return deleted; // Return deleted doc for further cleanup (files)
        });
    }

    async bulkDelete(projectId, ids) {
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            const db = this._readDocs(paths);
            db.rows = db.rows || [];

            const remaining = db.rows.filter(r => !ids.includes(r.id));
            const removedCount = db.rows.length - remaining.length;
            db.rows = remaining;

            fs.writeFileSync(paths.docs, JSON.stringify(db, null, 2));
            return removedCount;
        });
    }

    // Custom method for bulk replacement (used in merge/finalize flows)
    async saveFullDb(projectId, rows) {
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            const db = { rows };
            fs.writeFileSync(paths.docs, JSON.stringify(db, null, 2));
            return true;
        });
    }

    async logAudit(projectId, entry) {
        // Append to audit.json (could be mutex'd or just appendFile if we trust OS atomicity for appends, but let's mutex)
        const paths = this._getProjectPaths(projectId);
        const mutex = getMutex(projectId);

        // Audit is less critical, but let's be safe
        // Note: Reading whole audit array to append is bad for perf, but consistent with Legacy.
        // Improvement: Use fs.appendFileSync to a .jsonl file?
        // Project uses audit.json (array) AND audit.jsonl (lines) sometimes?
        // Legacy code:
        // const arr = JSON.parse(fs.readFileSync(ctx.files.audit, 'utf8'));
        // res.json(out);
        // It uses JSON array.

        return await mutex.runExclusive(async () => {
            this._ensureDb(paths);
            // Optimize: If file is huge, this hurts. Phase 2 fix.
            let list = [];
            try { list = JSON.parse(fs.readFileSync(paths.audit, 'utf8')); } catch { }
            if (!Array.isArray(list)) list = [];

            const record = { ...entry, ts: new Date().toISOString() };
            list.push(record);

            fs.writeFileSync(paths.audit, JSON.stringify(list, null, 2));
        });
    }

    async getAudit(projectId, filters) {
        const paths = this._getProjectPaths(projectId);
        if (!fs.existsSync(paths.audit)) return [];
        try {
            return JSON.parse(fs.readFileSync(paths.audit, 'utf8'));
        } catch { return []; }
    }
}

module.exports = new JsonDocsAdapter();
