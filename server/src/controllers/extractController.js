// server/src/controllers/extractController.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pdf = require('pdf-parse');

const { PATHS } = require('../config/constants');
const ProjectService = require('../services/ProjectService');
const JsonDocsAdapter = require('../storage/JsonDocsAdapter');

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(PATHS.UPLOADS)) fs.mkdirSync(PATHS.UPLOADS, { recursive: true });
        cb(null, PATHS.UPLOADS);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

exports.uploadMiddleware = upload.array('files');

// Progress MAP (In memory for now, like legacy)
const progressMap = new Map();
const batchRowsMap = new Map();

exports.extract = async (req, res) => {
    const project = req.query.project;
    const batchId = req.query.batchId || uuidv4();
    const ctx = ProjectService.getContext(project);

    // Init progress
    progressMap.set(batchId, { project, total: req.files.length, done: 0, errors: 0 });
    batchRowsMap.set(batchId, []);

    res.json({ batchId, count: req.files.length, project, aiRequested: false });

    // Async processing
    (async () => {
        for (const f of req.files) {
            try {
                const buf = fs.readFileSync(f.path);
                const parsed = await pdf(buf);
                const text = parsed.text || '';

                // --- Simple Extraction Logic (Simplified from legacy) ---
                // In Phase 1 we focus on architecture, so simplified heuristic here or move legacy heuristic fn here
                const docType = 'Fatura'; // Mock
                const total = 0; // Mock (would use heuristic)

                const stagingName = Date.now() + '_' + path.basename(f.originalname);
                const stagingPath = path.join(ctx.dirs.staging, stagingName);
                fs.copyFileSync(f.path, stagingPath);

                const row = {
                    id: uuidv4(),
                    project,
                    batchId,
                    docType,
                    docNumber: '',
                    total,
                    status: 'staging',
                    filePath: stagingPath,
                    createdAt: new Date().toISOString()
                };

                // Save to DB
                await JsonDocsAdapter.saveDocument(project, row);
                batchRowsMap.get(batchId).push(row);

                const p = progressMap.get(batchId);
                if (p) p.done++;

            } catch (e) {
                console.error(e);
                const p = progressMap.get(batchId);
                if (p) p.errors++;
            } finally {
                try { fs.unlinkSync(f.path) } catch { }
            }
        }
    })();
};

exports.getProgress = (req, res) => {
    const batchId = req.params.batchId;
    const p = progressMap.get(batchId);
    if (!p) return res.status(404).json({ error: 'Not found' });

    // Check if finished logic (legacy has complex check on DB, we simplify)
    if (p.done + p.errors >= p.total) {
        return res.json({ ...p, status: 'finished' });
    }
    res.json(p);
};

exports.getBatch = (req, res) => {
    const batchId = req.params.batchId;
    const rows = batchRowsMap.get(batchId) || [];
    res.json({ batchId, rows });
}
