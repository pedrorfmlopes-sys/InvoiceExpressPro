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
const knex = require('../../db/knex'); // For meta insert

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
    // Standardized req.project
    const project = req.project;
    const batchId = req.query.batchId || uuidv4();
    const ctx = ProjectService.getContext(project);

    // Get Secrets for AI
    const secrets = await ConfigService.getSecrets(project);
    // Allow Client override (Legacy V1 parity)
    if (req.headers['x-openai-key']) {
        secrets.openaiApiKey = req.headers['x-openai-key'];
    }
    const hasKey = !!secrets.openaiApiKey;

    // Init progress
    progressMap.set(batchId, { project, total: req.files.length, done: 0, errors: 0 });
    batchRowsMap.set(batchId, []);

    res.json({ batchId, count: req.files.length, project, aiRequested: hasKey });

    // Async processing
    (async () => {
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

                // --- AI Logic (Only if Profile didnt satisfy) ---
                if (extractionMethod !== 'profile' && hasKey && text.length >= 200) {
                    try {
                        const openai = new OpenAI({ apiKey: secrets.openaiApiKey });
                        const completion = await openai.chat.completions.create({
                            model: "gpt-3.5-turbo-1106", // or gpt-4o-mini if avail. 3.5 turbo json mode is good/cheap
                            messages: [
                                {
                                    role: "system", content: `You are an expert invoice data extractor for Portuguese documents.
                                Extract the following fields into JSON: docType, docNumber, date (YYYY-MM-DD), dueDate (YYYY-MM-DD), supplier, customer, total (number), currency (EUR), notes.
                                
                                Field 'docType' MUST be one of: 'fatura', 'recibo', 'nota_credito', 'guia_remessa'.
                                Translate foreign types (e.g. 'Invoice', 'Fattura', 'Rechnung') to the closest Portuguese match from the list.
                                
                                If a field is not found, use null.
                                Normalize numbers to float (e.g. "1.000,00" -> 1000.0).` },
                                { role: "user", content: `Extract from this text:\n\n${text.substring(0, 3000)}` }
                            ],
                            response_format: { type: "json_object" },
                            temperature: 0
                        });
                        const raw = JSON.parse(completion.choices[0].message.content);

                        // Normalization Helper
                        const normalizeType = (t) => {
                            if (!t) return 'other';
                            const lower = t.toLowerCase().replace(/[\s-]/g, '_');
                            if (lower.includes('credit') || lower.includes('nota_de_credito')) return 'nota_credito';
                            if (lower.includes('guia') || lower.includes('remessa')) return 'guia_remessa';
                            if (lower.includes('fatura') || lower.includes('invoice') || lower.includes('fattura')) return 'fatura';
                            if (lower.includes('recibo') || lower.includes('receipt')) return 'recibo';
                            return lower; // fallback
                        };

                        raw.docType = normalizeType(raw.docType);

                        // Validation
                        // check total sanity
                        const nTotal = parseFloat(raw.total);
                        if (!isNaN(nTotal) && nTotal > 0 && nTotal < 1e7) raw.total = nTotal;
                        else raw.total = 0;

                        // Check basic required fields to consider "AI Success"
                        if (raw.docNumber || raw.date || raw.total > 0) {
                            extracted = {
                                docType: raw.docType,
                                docNumber: raw.docNumber || '',
                                date: raw.date || '',
                                dueDate: raw.dueDate || '',
                                supplier: raw.supplier || '',
                                customer: raw.customer || '',
                                total: raw.total || 0,
                                needsOcr: false,
                                confidence: 0.9,
                                notes: raw.notes || ''
                            };
                            extractionMethod = 'ai';
                        } else {
                            throw new Error("AI returned empty/invalid data");
                        }
                    } catch (aiErr) {
                        console.log("AI Extraction failed, falling back:", aiErr.message);
                        extractionMethod = 'fallback_regex'; // Explicit fallback
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

                // Fallback / Regex if AI failed or not requested or text too short
                if (extractionMethod !== 'ai') {
                    extracted = extractRegex(text);
                }

                const stagingName = Date.now() + '_' + path.basename(f.originalname);
                const stagingPath = path.join(ctx.dirs.staging, stagingName);
                fs.copyFileSync(f.path, stagingPath);

                const row = {
                    id: uuidv4(),
                    project,
                    batchId,
                    ...extracted,
                    extractionMethod,
                    status: 'staging',
                    filePath: stagingPath,
                    createdAt: new Date().toISOString()
                };

                // Save to DB
                await Adapter.saveDocument(project, row);
                batchRowsMap.get(batchId).push(row);

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
