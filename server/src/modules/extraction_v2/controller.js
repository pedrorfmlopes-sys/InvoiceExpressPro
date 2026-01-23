const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdf = require('pdf-parse');

const Engine = require('../../engine/engine');
const ProjectService = require('../../services/ProjectService');
const Adapter = require('../../storage/getDocsAdapter');
// Reuse middleware from existing module to ensure consistency
const processingController = require('../processing/controller');

exports.uploadMiddleware = processingController.uploadMiddleware;

exports.extract = async (req, res) => {
    try {
        const project = req.project;
        const batchId = req.query.batchId || uuidv4();
        const ctx = ProjectService.getContext(project);

        const results = [];

        for (const f of req.files) {
            try {
                // 1. Read PDF Text
                const buf = fs.readFileSync(f.path);
                const parsed = await pdf(buf);
                const text = (parsed.text || '').trim();

                // 2. Run Engine V2
                const normalized = await Engine.process(text);

                // 3. Prepare Persistence
                const stagingName = Date.now() + '_' + path.basename(f.originalname);
                const stagingPath = path.join(ctx.dirs.staging, stagingName);
                fs.copyFileSync(f.path, stagingPath);

                const row = {
                    id: uuidv4(),
                    project,
                    batchId,
                    status: 'staging',
                    filePath: stagingPath,
                    createdAt: new Date().toISOString(),
                    // Flattened basic fields for compatibility with existing UI columns
                    docType: normalized.docType,
                    docNumber: normalized.docNumber,
                    date: normalized.dates.issued,
                    total: normalized.totals.gross || normalized.totals.net || 0,
                    clientName: normalized.entities.customer.name, // Mapping
                    needsReview: normalized.needsReview,
                    confidence: normalized.confidence,
                    extractionMethod: 'v2_engine',

                    // V2 Store: Everything in raw_json.normalized
                    raw_json: {
                        normalized,
                        v2_metadata: {
                            engineVersion: '2.0.0',
                            textLength: text.length
                        }
                    }
                };

                // 4. Save to DB
                await Adapter.saveDocument(project, row);

                results.push({
                    documentId: row.id,
                    fileName: f.originalname,
                    status: 'success',
                    normalized,
                    needsReview: row.needsReview,
                    confidence: row.confidence
                });

            } catch (fileErr) {
                console.error(`[ExtractV2] File Error (${f.originalname}):`, fileErr);
                results.push({
                    fileName: f.originalname,
                    status: 'error',
                    error: fileErr.message
                });
            } finally {
                // Cleanup temp upload
                try { fs.unlinkSync(f.path); } catch { }
            }
        }

        res.json({
            batchId,
            project,
            count: results.length,
            results
        });

    } catch (err) {
        console.error("[ExtractV2] Global Error:", err);
        res.status(500).json({ error: err.message });
    }
};
