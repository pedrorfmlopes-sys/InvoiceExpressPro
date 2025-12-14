// server/src/controllers/projectController.js
const ProjectService = require('../services/ProjectService');
const ConfigService = require('../services/ConfigService');

exports.listProjects = (req, res) => {
    const names = ProjectService.listProjects();
    res.json({ projects: names });
};

exports.createProject = (req, res) => {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const safe = ProjectService.createProject(name);
        res.json({ ok: true, name: safe });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteProject = (req, res) => {
    const name = req.params.name;
    ProjectService.deleteProject(name);
    res.json({ ok: true }); // Always ok in legacy
};

exports.health = (req, res) => {
    // Mock health check behaving like legacy
    const project = req.query.project;
    const ctx = ProjectService.getContext(project);
    // Legacy checks doctypes clean
    res.json({ ok: true, items: ConfigService.getDocTypes(project) });
};

exports.listDirs = (req, res) => {
    // Simplified dir listing (mock or real implementation if necessary)
    // Legacy does fs.readdirSync(ctx.dirs.base)
    // We'll skimp on this as it's secondary, or implement if easy.
    const project = req.query.project;
    const ctx = ProjectService.getContext(project);
    const fs = require('fs');
    const path = require('path');
    try {
        const entries = fs.readdirSync(ctx.dirs.base).filter(n => {
            try { return fs.statSync(path.join(ctx.dirs.base, n)).isDirectory() } catch { return false }
        }).sort();
        res.json({ ok: true, entries, excelOutputPath: '', projectBase: ctx.dirs.base });
    } catch {
        res.json({ ok: false });
    }
};

exports.mkdir = (req, res) => {
    const { dir } = req.body || {};
    const project = req.query.project;
    if (!dir) return res.status(400).json({ error: 'dir required' });
    try {
        const fs = require('fs');
        const path = require('path');
        const ProjectService = require('../services/ProjectService'); // Ensure ref if not global
        const ctx = ProjectService.getContext(project);
        const target = path.join(ctx.dirs.base, dir);

        // Simple security check (could be better)
        if (!target.startsWith(ctx.dirs.base)) return res.status(403).json({ error: 'Invalid path' });

        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.setOutput = (req, res) => {
    // Just acknowledge for now
    res.json({ ok: true });
};
