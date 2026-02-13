// server/src/modules/processing/controller.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pdf = require('pdf-parse');
const OpenAI = require('openai');

const { PATHS } = require('../../config/constants');
const ProjectService = require('../../services/ProjectService');
const ConfigService = require('../../services/ConfigService');
const Adapter = require('../../storage/getDocsAdapter');
const ExtractionService = require('../extraction/service');
const MasterEngine = require('../../engine/engine');
const CustomerService = require('../crm/CustomerService'); // Added for CRM integration
const knex = require('../../db/knex'); // Added for batch tracking

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
// Wrapped Middleware to catch Multer errors and prevent 502 crashes
exports.uploadMiddleware = (req, res, next) => {
    // Ensure dir exists (Redundant safety)
    try {
        if (!fs.existsSync(PATHS.UPLOADS)) fs.mkdirSync(PATHS.UPLOADS, { recursive: true });
    } catch (e) {
        console.error('[Multer] Setup Error:', e);
        return res.status(500).json({ error: 'Upload directory inaccessible: ' + e.message });
    }

    const upload = multer({ storage }).array('files');

    upload(req, res, (err) => {
        if (err) {
            console.error('[Multer] Upload Error:', err);
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: `Upload Error: ${err.message} (${err.code})` });
            }
            return res.status(500).json({ error: 'Internal Upload Error: ' + err.message });
        }
        next();
    });
};

// Progress MAP removed in favor of extraction_batches table

// Helper: Classic Regex Fallback
function extractRegex(text) {
    let docType = '';
    let total = 0;
    let date = '';
    let docNumber = '';
    let supplier = '';
    let needsOcr = false;
    let confidence = 0.5;

    if (text.length < 50) {
        needsOcr = true;
        docNumber = 'SCAN/OCR REQUIRED';
        confidence = 0;
    } else {
        // 1. Try Date
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch) date = dateMatch[0];

        // 2. Try Total
        const totalMatch = text.match(/Total[\s\S]{0,20}?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i);
        if (totalMatch) {
            try {
                const raw = totalMatch[1].replace(/\./g, '').replace(',', '.');
                total = parseFloat(raw);
            } catch { }
        }

        // 3. Try Doc Number
        const numMatch = text.match(/(Fatura|FS|FT|FR)\s?([A-Za-z0-9\/]+)/i);
        if (numMatch) {
            docType = 'Fatura';
            docNumber = numMatch[2];
        }
    }
    return { docType, docNumber, date, total, supplier, needsOcr, confidence };
}

exports.extract = async (req, res) => {
    try {
        // Standardized req.project
        const project = req.project;
        const batchId = req.query.batchId || uuidv4();
        const ctx = ProjectService.getContext(project);

        console.log(`[Extract] Starting Batch ${batchId} for Project ${project}`);

        // Get Secrets for AI
        const secrets = await ConfigService.getSecrets(project);
        // Allow Client override (Legacy V1 parity)
        if (req.headers['x-openai-key']) {
            secrets.openaiApiKey = req.headers['x-openai-key'];
        }
        const hasKey = !!secrets.openaiApiKey;

        // Init progress in DB
        await knex('extraction_batches').insert({
            id: batchId,
            project,
            total_files: req.files.length,
            done_files: 0,
            error_files: 0,
            status: 'processing',
            created_at: new Date(),
            updated_at: new Date()
        });

        res.json({ batchId, count: req.files.length, project, aiRequested: hasKey });

        // Async processing (Fire & Forget, handled by internal try/catch)
        (async () => {
            let done = 0;
            let errors = 0;
            for (const f of req.files) {
                try {
                    const buf = fs.readFileSync(f.path);
                    const parsed = await pdf(buf);
                    const text = (parsed.text || '').trim();

                    let extracted = {};
                    let extractionMethod = 'regex';
                    let profileMatch = null;

                    // --- 0. Learning Module (Phase A) ---
                    try {
                        const matchResult = await ExtractionService.matchProfile(buf);
                        if (matchResult.profile) {
                            console.log(`[Extract] Profile Matched: ${matchResult.profile.name} (${matchResult.confidence})`);
                            profileMatch = matchResult;

                            // Phase B: Extract
                            const extractionResult = await ExtractionService.extractWithProfile(buf, matchResult.profile.id);
                            if (extractionResult.extracted && Object.keys(extractionResult.extracted).length > 0) {
                                extracted = {
                                    ...extracted,
                                    ...extractionResult.extracted,
                                    confidence: 0.95, // High confidence for profile
                                    needsOcr: false,
                                    _profile: { id: matchResult.profile.id, name: matchResult.profile.name }
                                };
                                extractionMethod = 'profile';
                            }
                        }
                    } catch (profileErr) {
                        console.error("[Extract] Profile Logic Error:", profileErr);
                    }

                    // --- Master Engine (Phase C) ---
                    // If profile didn't extract LINES (weak profile), OR didn't match, use the Master Engine
                    // This ensures we don't get stuck with a "Date-Only" profile when the Engine could find 50 lines.
                    // FORCE: Always try Engine for Nicolazzi/Ritmonio (V2 Migration Candidates)
                    const isV2Candidate = /NICOLAZZI|Ritmonio/i.test(text);
                    const profileMissedLines = extractionMethod === 'profile' && (!extracted.lines || extracted.lines.length === 0);

                    if (extractionMethod !== 'profile' || profileMissedLines || isV2Candidate) {
                        try {
                            const engineResult = await MasterEngine.process(text, buf);

                            // Smart Merge: Prefer Engine lines if Profile has none
                            // If we are here because profileMissedLines is true, matches will be merged.
                            const newExtracted = {
                                ...extracted,
                                ...engineResult,
                                // Priority: if engine found lines, use them. If not, keep what we had (empty).
                                lines: (engineResult.lines && engineResult.lines.length > 0) ? engineResult.lines : (extracted.lines || [])
                            };

                            extracted = newExtracted;

                            // Update Method tracking only if Engine actually contributed useful data (lines)
                            if (engineResult.lines && engineResult.lines.length > 0) {
                                extractionMethod = engineResult.docTypeSource || 'engine_override';
                            } else if (extractionMethod !== 'profile') {
                                extractionMethod = engineResult.docTypeSource || 'engine';
                            }

                            if (profileMissedLines && extracted.lines && extracted.lines.length > 0) {
                                console.log("[Extract] Engine rescued Profile: Found lines where Profile found none.");
                            }

                        } catch (engineErr) {
                            console.error("[Extract] Master Engine Error:", engineErr);
                            // Fallback only if we really have nothing yet
                            if (extractionMethod !== 'profile') {
                                extracted = { ...extracted, ...extractRegex(text) };
                                extractionMethod = 'fallback_regex';
                            }
                        }
                    }

                    // --- Quality Gate: Validate docNumber ---
                    if (extracted.docNumber) {
                        const dn = String(extracted.docNumber).trim();
                        const invalid = dn.length < 3
                            || /^\d{1,2}$/.test(dn) // "1", "99" often wrong
                            || ['N/A', 'unknown', '-', 'null', 'undefined'].includes(dn.toLowerCase())
                            || dn.toLowerCase().includes('iban'); // Common hallucination

                        if (invalid) {
                            console.log(`[Extract] InvalidDocNumber detected: "${dn}". Clearing.`);
                            extracted.docNumber = null;
                        }
                    }

                    // --- Targeted Fallback: Try to find docNumber via Regex if missing ---
                    if (!extracted.docNumber && text.length > 50) {
                        // 1. "12345/A" or "12345-A"
                        let m = text.match(/\b(\d{1,6})\s*[\/-]\s*([A-Z0-9]{1,4})\b/);
                        if (m) extracted.docNumber = `${m[1]}/${m[2]}`;
                        else {
                            // 2. "Fatura... AB1234"
                            m = text.match(/(?:Fatura|Recibo|FT|FR|NC|ND|Guia)\s*(?:n\.?|nº|number|num)?\s*[:#.]?\s*([A-Z0-9\/-]{3,})/i);
                            if (m) extracted.docNumber = m[1].replace(/\s+/g, '');
                            else {
                                // 3. Serial pattern: "0000123/A"
                                m = text.match(/\b0{2,}\d{1,6}\/[A-Z]\b/);
                                if (m) extracted.docNumber = m[0];
                            }
                        }
                        if (extracted.docNumber) console.log(`[Extract] Recovered docNumber via Regex: ${extracted.docNumber}`);
                    }

                    // --- Scenario 3: AI Reprompt (Confident but missing docNumber) ---
                    if (!extracted.docNumber && extractionMethod === 'ai' && extracted.confidence >= 0.7 && hasKey) {
                        try {
                            console.log("[Extract] Reprompting AI for docNumber...");
                            const openai = new OpenAI({ apiKey: secrets.openaiApiKey });
                            const completion = await openai.chat.completions.create({
                                model: "gpt-3.5-turbo-1106",
                                messages: [
                                    { role: "system", content: 'Find the Invoice Number (docNumber). Return JSON: { "docNumber": "string" or null }.' },
                                    { role: "user", content: `Text:\n${text.substring(0, 2000)}` }
                                ],
                                response_format: { type: "json_object" },
                                temperature: 0
                            });
                            const raw = JSON.parse(completion.choices[0].message.content);
                            if (raw.docNumber && raw.docNumber.length > 2) {
                                extracted.docNumber = raw.docNumber;
                                console.log(`[Extract] Reprompt success: ${extracted.docNumber}`);
                            }
                        } catch (e) { console.log("[Extract] Reprompt failed", e.message); }
                    }

                    // Fallback / Regex ONLY if other methods failed (AI, Engine, Profile)
                    if (extractionMethod === 'regex' || extractionMethod === 'fallback_regex') {
                        extracted = extractRegex(text);
                    }

                    const stagingName = Date.now() + '_' + path.basename(f.originalname);
                    const stagingPath = path.join(ctx.dirs.staging, stagingName);

                    // DIAGNOSTIC LOG: Confirm exact write location
                    console.log(`[Extract] Saving file to: ${stagingPath}`);

                    fs.copyFileSync(f.path, stagingPath);

                    // Flatten complex objects for DB/List View
                    const flatData = {
                        total: extracted.total || (extracted.totals ? extracted.totals.total : 0),
                        date: extracted.date || (extracted.dates ? extracted.dates.issued : null),
                        supplier: (extracted.entities && extracted.entities.supplier && extracted.entities.supplier.name)
                            ? extracted.entities.supplier.name
                            : (extracted.supplier || ''),
                        customer: (extracted.entities && extracted.entities.customer && extracted.entities.customer.name)
                            ? extracted.entities.customer.name
                            : (extracted.customer || '')
                    };

                    const row = {
                        id: uuidv4(),
                        project,
                        batchId,
                        ...extracted,
                        ...flatData, // Overwrite with flattened versions for top-level columns
                        rawJson: extracted, // Store the full object for viewers
                        extractionMethod,
                        status: 'staging',
                        filePath: stagingPath,
                        createdAt: new Date().toISOString()
                    };

                    // Save to DB
                    await Adapter.saveDocument(project, row);

                    // Save Extraction Meta (if profiled)
                    if (profileMatch && profileMatch.profile) {
                        try {
                            await knex('document_extraction_meta').insert({
                                doc_id: row.id,
                                profile_id: profileMatch.profile.id,
                                confidence: 0.95
                            }).onConflict('doc_id').merge();
                        } catch (metaErr) {
                            console.error("Failed to save extraction meta:", metaErr);
                        }
                    }

                    // --- CRM INTEGRATION ---
                    // Capture customer data immediately
                    if (extracted.confidence > 0.6) {
                        try {
                            await CustomerService.upsertFromExtraction(project, row);
                            console.log(`[Extract] Auto-captured customer: ${row.customer}`);
                        } catch (crmErr) {
                            console.error("[Extract] Failed to capture customer:", crmErr.message);
                        }
                    }
                    // -----------------------

                    done++;
                    await knex('extraction_batches').where({ id: batchId }).update({
                        done_files: done,
                        updated_at: new Date()
                    });

                } catch (e) {
                    console.error(e);
                    errors++;
                    await knex('extraction_batches').where({ id: batchId }).update({
                        error_files: errors,
                        updated_at: new Date()
                    });
                } finally {
                    try { fs.unlinkSync(f.path) } catch { }
                }
            }

            // Finalize Batch Status
            await knex('extraction_batches').where({ id: batchId }).update({
                status: 'finished',
                updated_at: new Date()
            });
        })();

    } catch (e) {
        console.error('[Extract] Controller Initialization Error:', e);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to initialize extraction: ' + e.message });
        }
    }
};

exports.getProgress = async (req, res) => {
    const batchId = req.params.batchId;
    try {
        const p = await knex('extraction_batches').where({ id: batchId }).first();
        if (!p) return res.status(404).json({ error: 'Not found' });

        // Map canonical fields to frontend names if necessary (or keep simple)
        const response = {
            project: p.project,
            total: p.total_files,
            done: p.done_files,
            errors: p.error_files,
            status: p.status
        };

        res.json(response);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getBatch = async (req, res) => {
    const batchId = req.params.batchId;
    const project = req.project || 'default';
    try {
        const result = await Adapter.getDocs(project, { page: 1, limit: 1000, status: 'staging' });
        const rows = result.rows.filter(r => r.batchId === batchId);
        res.json({ batchId, rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.reprocess = async (req, res) => {
    const { id } = req.params;
    const project = req.project;

    try {
        console.log(`[Reprocess] Starting for doc ${id} in project ${project}`);

        // 1. Fetch doc from DB
        const doc = await Adapter.getDoc(project, id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        if (!doc.filePath || !fs.existsSync(doc.filePath)) {
            return res.status(400).json({ error: 'Source file not found on disk' });
        }

        // 2. Read and Extract
        const buf = fs.readFileSync(doc.filePath);
        const parsed = await pdf(buf);
        const text = (parsed.text || '').trim();

        // 3. Run Master Engine
        let engineResult;
        try {
            engineResult = await MasterEngine.process(text, buf);
        } catch (engineErr) {
            console.error(`[Reprocess] Engine Failed for doc ${id}:`, engineErr);
            throw new Error(`MasterEngine Extraction Failed: ${engineErr.message}`);
        }

        // Flatten complex objects for DB/List View
        const flatData = {
            total: engineResult.total || (engineResult.totals ? engineResult.totals.total : 0),
            date: engineResult.date || (engineResult.dates ? engineResult.dates.issued : null),
            supplier: (engineResult.entities && engineResult.entities.supplier && engineResult.entities.supplier.name)
                ? engineResult.entities.supplier.name
                : (engineResult.supplier || ''),
            customer: (engineResult.entities && engineResult.entities.customer && engineResult.entities.customer.name)
                ? engineResult.entities.customer.name
                : (engineResult.customer || '')
        };

        // 4. Merge results
        const updatedDoc = {
            ...doc,
            ...engineResult,
            ...flatData, // Ensure top-level columns are populated
            rawJson: engineResult,
            extractionMethod: engineResult.docTypeSource || 'reprocessed',
            status: 'staging' // Keep in staging
        };

        // 5. Save back to DB
        await Adapter.saveDocument(project, updatedDoc);

        // --- CRM INTEGRATION ---
        try {
            await CustomerService.upsertFromExtraction(project, updatedDoc, true); // Explicit update on reprocess
        } catch (crmErr) {
            console.error(`[Reprocess] Failed to update CRM for doc ${id}:`, crmErr.message);
        }
        // -----------------------

        console.log(`[Reprocess] Success for doc ${id}`);
        res.json(updatedDoc);

    } catch (err) {
        console.error(`[Reprocess] Error for doc ${id}:`, err);
        res.status(500).json({ error: err.message });
    }
};
