// server/src/services/ProjectService.js
const fs = require('fs');
const path = require('path');
const { PATHS } = require('../config/constants');
const { ensureFile } = require('../utils/helpers');

class ProjectService {
    constructor() {
        // Ensure root projects dir matches legacy checks
        if (!fs.existsSync(PATHS.PROJECTS)) {
            fs.mkdirSync(PATHS.PROJECTS, { recursive: true });
        }
        // Also CONFIG dir is used globally in legacy
        if (!fs.existsSync(PATHS.CONFIG)) {
            fs.mkdirSync(PATHS.CONFIG, { recursive: true });
        }
    }

    listProjects() {
        const root = PATHS.PROJECTS;
        const results = [];

        // Helper to check if a path is a "valid project dir" (has a docs.json or is intended)
        const isProjectDir = (p) => {
            try { return fs.statSync(p).isDirectory(); } catch { return false; }
        };

        // 1. Scan Level 1 (e.g. "default", "demo")
        const level1 = fs.readdirSync(root).filter(n => isProjectDir(path.join(root, n)));

        for (const l1 of level1) {
            const p1 = path.join(root, l1);

            // Check if level 1 Itself is a project (simple mode)
            // But also scan inside for Org/Repo style
            const level2 = fs.readdirSync(p1).filter(n => {
                // Ignore standard internal folders to avoid noise
                if (['staging', 'archive', 'templates', 'node_modules', '.git'].includes(n)) return false;
                return isProjectDir(path.join(p1, n));
            });

            if (level2.length > 0 && !fs.existsSync(path.join(p1, 'docs.json'))) {
                // It's likely an Org folder (container), not a project, so add children
                level2.forEach(l2 => results.push(`${l1}/${l2}`));
            } else {
                // It's a simple project folder (or empty container which we treat as project for now)
                results.push(l1);
            }
        }

        return results.sort();
    }

    createProject(name) {
        if (!name || typeof name !== 'string') throw new Error('Invalid name');
        const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '');
        const dir = path.join(PATHS.PROJECTS, safeName);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            // Initialize default structure
            const docsJson = path.join(dir, 'docs.json');
            fs.writeFileSync(docsJson, JSON.stringify({ rows: [] }, null, 2));
        }
        return safeName;
    }

    deleteProject(name) {
        const dir = path.join(PATHS.PROJECTS, name);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            return true;
        }
        return false;
    }

    // Helper for context paths (Legacy "ctxOf")
    getContext(projectName) {
        const p = projectName || 'default';
        const base = path.join(PATHS.PROJECTS, p);

        // Ensure basic structure exists
        if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

        const dirs = {
            base,
            staging: path.join(base, 'staging'),
            archive: path.join(base, 'archive'),
            templates: path.join(base, 'templates'), // for legacy teacher
        };

        // Ensure subdirs (lazy creation as in legacy)
        [dirs.staging, dirs.archive, dirs.templates].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });

        const files = {
            docs: path.join(base, 'docs.json'),
            audit: path.join(base, 'audit.json'),
            config: path.join(base, 'config.json'),
            synonyms: path.join(PATHS.CONFIG, 'doctypes.synonyms.json'), // Global
            doctypes: path.join(PATHS.CONFIG, 'doctypes.json'), // Global or Local? Legacy says logic mixes.
            // Actually legacy server.js line 39: const FILE_SYNONYMS = path.join(DIR_CONFIG, 'doctypes.synonyms.json');
            // And per project: const docTypesPath = path.join(ctx.dirs.base, 'doctypes.json');
            normalize: path.join(base, 'normalization.json'),
            logo: path.join(base, 'app-logo.png')
        };

        return { project: p, dirs, files };
    }
}

module.exports = new ProjectService();
