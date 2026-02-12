const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const DocService = require('../../services/DocService');
const ProjectService = require('../../services/ProjectService');
const ConfigService = require('../../services/ConfigService');
const Adapter = require('../../storage/getDocsAdapter');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const UniversalDocService = require('./UniversalDocService');
const CustomerService = require('../crm/CustomerService');

// --- Helper: Regex Fallback ---
function matchDocType(raw, definitions) {
    if (!raw) return { id: null, label: null, confidence: 0 };
    const clean = String(raw).trim().toLowerCase();

    // 1. Exact/Synonym Match
    for (const def of definitions) {
        if (def.id === clean || def.labelPt.toLowerCase() === clean) return { id: def.id, label: def.labelPt, confidence: 1.0 };
        if (def.synonyms.some(s => s.toLowerCase() === clean)) return { id: def.id, label: def.labelPt, confidence: 0.95 };
    }

    // 2. Contains Match (heuristic)
    // Priority: If both 'Proforma' and 'Fatura' match, 'Proforma' should win
    // We achieve this by checking in order (Proforma is first in definitions now)
    for (const def of definitions) {
        if (clean.includes(def.labelPt.toLowerCase())) return { id: def.id, label: def.labelPt, confidence: 0.8 };
        if (def.keywords.some(k => clean.includes(k))) return { id: def.id, label: def.labelPt, confidence: 0.75 };
    }

    return { id: null, label: null, confidence: 0 };
}

function extractRegex(text) {
    let docType = '';
    let total = 0;
    let date = '';
    let docNumber = '';
    let supplier = '';
    let customer = '';
    let vat = ''; // Added
    let references = [];
    let needsOcr = false;
    let confidence = 0.5;

    if (text.length < 50) {
        needsOcr = true;
        docNumber = 'SCAN/OCR REQUIRED';
        confidence = 0;
    } else {
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch) date = dateMatch[0];

        const totalMatch = text.match(/Total[\s\S]{0,20}?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i);
        if (totalMatch) {
            try {
                const raw = totalMatch[1].replace(/\./g, '').replace(',', '.');
                total = parseFloat(raw);
            } catch { }
        }

        // Customer (Improved Regex with Unicode support)
        const cusMatch = text.match(/(?:Cliente|Destinat[áa]rio|Exmo|Bill To|Spett\.le)\s*[:.]?\s*([A-Za-z0-9\u00C0-\u00FF .&-]{3,50})/i);
        if (cusMatch) customer = cusMatch[1].trim();

        // VAT / NIF Extraction (New)
        // Look for common labels + 9-12 digits (optional country code)
        // e.g. NIF: 123456789, VAT: PT123456789, P.IVA 001122
        const vatMatch = text.match(/(?:NIF|N\.I\.F\.|Contribuinte|VAT|IVA|P\.IVA|Vat Number)\s*[:.]?\s*((?:[A-Z]{2})?\s*\d{9,12})/i);
        if (vatMatch) {
            // we attach this to the global scope or return object
            // but `extractRegex` variables are local. let's add `vat` var above.
        }

        // References
        const refPatterns = [
            { type: 'PO', regex: /\b(?:PO|Order|Encomenda)\s*[:#.]?\s*([A-Z0-9-]{3,})/i },
            { type: 'Ref', regex: /\b(?:Ref|Rif|Reference)\s*[:.]?\s*([A-Z0-9-]{3,})/i },
            { type: 'Proposta', regex: /\b(?:Proposta|Proposal)\s*[:#.]?\s*([A-Z0-9-]{3,})/i }
        ];

        for (const p of refPatterns) {
            const m = text.match(p.regex);
            if (m) {
                const val = m[1].trim();
                // VAT/NIF Heuristic Filter
                // If it looks like a VAT (9 digits, starts with PT or no prefix), ignore it as PO
                const isNif = /^(?:PT)?\d{9}$/.test(val) || text.toLowerCase().includes(`nif ${val}`) || text.toLowerCase().includes(`vat ${val}`);

                if (!isNif) {
                    references.push({ type: p.type, value: val, confidence: 0.6 });
                }
            }
        }

        // Quality Gate for Regex DocNumber
        let m = text.match(/\b(\d{1,6})\s*[\/-]\s*([A-Z0-9]{1,4})\b/);
        if (m) docNumber = `${m[1]}/${m[2]}`;
        else {
            m = text.match(/(Fatura|Recibo|Proforma|FT|FR|NC|ND|Guia|Fattura|Invoice)\s*(?:n\.?|nº|number|num)?\s*[:#.]?\s*([A-Z0-9\/-]{3,})/i);
            if (m) {
                // Instead of hardcoded 'Fatura', use the actually matched word
                docType = m[1];
                docNumber = m[2].replace(/\s+/g, '');
            }
        }
    }
    // Logic for VAT assignment from match (since variables are local in this scope)
    // 1. Try Standard "Label: Value" (e.g. NIF: 123456789)
    let vatMatch = text.match(/(?:NIF|N\.I\.F\.|Contribuinte|VAT|IVA|P\.IVA|Vat Number)\s*[:.]?\s*((?:[A-Z]{2})?\s*\d{9,12})/i);
    if (vatMatch) vat = vatMatch[1].replace(/\s/g, '').toUpperCase();

    // 2. Try "Value [newline] Label" (Reverse layout often found in PDF text streams)
    if (!vat) {
        vatMatch = text.match(/(\d{9,12})\s*\n\s*(?:Vat|NIF|IVA)/i);
        if (vatMatch) vat = vatMatch[1].replace(/\s/g, '').toUpperCase();
    }

    // 3. Try "Label [newline] Value"
    if (!vat) {
        vatMatch = text.match(/(?:Vat|NIF|IVA)\s*\n\s*(\d{9,12})/i);
        if (vatMatch) vat = vatMatch[1].replace(/\s/g, '').toUpperCase();
    }

    return { docType, docNumber, date, total, supplier, customer, vat, references, needsOcr, confidence };
}

// --- Controller Methods ---

const processingController = require('../processing/controller');

exports.reprocess = processingController.reprocess;

exports.upload = async (req, res) => {
    try {
        const project = req.project || 'default';
        const ctx = ProjectService.getContext(project);
        const uploadedDocs = [];

        for (const f of req.files) {
            const stagingName = `v2_staging_${Date.now()}_${path.basename(f.originalname)}`;
            const stagingPath = path.join(ctx.dirs.staging, stagingName);
            fs.copyFileSync(f.path, stagingPath);
            fs.unlinkSync(f.path); // cleanup temp multer

            const doc = {
                id: uuidv4(),
                project,
                status: 'uploaded', // v2 enum
                origName: f.originalname,
                filePath: stagingPath,
                createdAt: new Date().toISOString(),
                extractionMethod: 'pending'
            };

            await Adapter.saveDocument(project, doc);
            uploadedDocs.push(doc);
        }

        res.json({ ok: true, docs: uploadedDocs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.extract = async (req, res) => {
    // Accepts { docIds: [] }
    // Returns { ok: true, results: [...] }
    try {
        const project = req.project || 'default';
        const { docIds } = req.body;
        if (!Array.isArray(docIds)) return res.status(400).json({ error: 'docIds array required' });

        // Load DocTypes for matching
        const definitions = await ConfigService.getDocTypes(project);

        const secrets = await ConfigService.getSecrets(project);
        const hasKey = !!secrets.openaiApiKey;
        const results = [];

        for (const id of docIds) {
            try {
                // Get fresh doc
                const doc = await Adapter.getDoc(project, id);
                if (!doc) throw new Error('not found');
                if (!fs.existsSync(doc.filePath)) throw new Error('file missing');

                const buf = fs.readFileSync(doc.filePath);
                const parsed = await pdf(buf);
                const text = (parsed.text || '').trim();

                let extracted = {};
                let extractionMethod = 'regex';
                let confidence = 0.5;

                // AI Logic (Copied/Adapted from v1 but streamlined)
                if (hasKey && text.length >= 200) {
                    try {
                        const openai = new OpenAI({ apiKey: secrets.openaiApiKey });
                        const completion = await openai.chat.completions.create({
                            model: "gpt-3.5-turbo-1106",
                            messages: [
                                { role: "system", content: 'Extract invoice data to JSON: docType, docNumber, date (YYYY-MM-DD), total (number), supplier, customer (Bill To), currency. Also extract references array [{type, value}]. Types: PO, Order, Ref. Normalize numbers to float. If not found, null.' },
                                { role: "user", content: `Text:\n${text.substring(0, 3000)}` }
                            ],
                            response_format: { type: "json_object" },
                            temperature: 0
                        });
                        const raw = JSON.parse(completion.choices[0].message.content);

                        // Validation
                        if (raw.total > 0 || (raw.docNumber && raw.docNumber.length > 2)) {
                            extracted = {
                                docTypeRaw: raw.docType || '',
                                docNumber: raw.docNumber || '',
                                date: raw.date || '',
                                total: raw.total || 0,
                                currency: raw.currency || 'EUR',
                                supplier: raw.supplier || '',
                                customer: raw.customer || '',
                                references: Array.isArray(raw.references) ? raw.references : [],
                                needsOcr: false
                            };
                            extractionMethod = 'ai';
                            confidence = 0.9;
                        } else {
                            throw new Error('AI returned empty data');
                        }
                    } catch (aiErr) {
                        console.log(`[V2] AI failed for ${id}:`, aiErr.message);
                        extractionMethod = 'fallback_regex';
                    }
                }

                if (extractionMethod !== 'ai') {
                    extracted = extractRegex(text);
                    extracted.docTypeRaw = extracted.docType; // Preserve regex guess as raw
                }

                // Canonicalize DocType
                const matched = matchDocType(extracted.docTypeRaw || extracted.docType, definitions);
                let docTypeId = matched.id;
                let docTypeLabel = matched.label; // Canonical PT label
                let needsReviewDocType = false;

                if (!docTypeId) {
                    docTypeId = null;
                    docTypeLabel = extracted.docTypeRaw || extracted.docType; // Keep raw as label if unknown
                    needsReviewDocType = true;
                }

                // Quality Gate DocNumber
                if (extracted.docNumber) {
                    const dn = String(extracted.docNumber).trim();
                    if (dn.length < 3 || /^\d{1,2}$/.test(dn) || ['null', 'undefined', 'N/A'].includes(dn)) {
                        extracted.docNumber = null; // Reset garbage
                    }
                }

                // V2.1 Quality Gate: Check Customer consistency
                let needsReview = false;
                if (!extracted.customer || extracted.customer.length < 3) needsReview = true;
                if (extracted.supplier && extracted.customer && extracted.supplier === extracted.customer) needsReview = true; // Suspicious

                const updates = {
                    ...extracted,
                    status: 'extracted',
                    extractionMethod,
                    confidence,
                    updatedAt: new Date().toISOString(),
                    // Canonical Data
                    docTypeId,
                    docTypeLabel,
                    docTypeSource: extractionMethod,
                    docTypeConfidence: matched.confidence,
                    needsReviewDocType,
                    // Consistency: Legacy field must match canonical
                    docType: docTypeLabel || docTypeRaw || '',
                    // Add warning flag for UI
                    needsReview
                };

                const updated = await Adapter.updateDoc(project, id, updates);

                // Phase 36: Capture Customer Data during EXTRACTION
                try {
                    await CustomerService.upsertFromExtraction(project, updated, false);
                } catch (e) {
                    console.error('[CRM] Failed to capture customer during extraction:', e.message);
                }

                results.push({ id, ok: true, row: updated });

            } catch (err) {
                console.error(`[V2] Error extracting ${id}:`, err);
                results.push({ id, ok: false, error: err.message });
            }
        }

        res.json({ ok: true, results });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.bulkPatch = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { ids, patch } = req.body;
        if (!Array.isArray(ids)) throw new Error('ids must be array');

        const promises = ids.map(id => Adapter.updateDoc(project, id, patch));
        await Promise.all(promises);

        res.json({ ok: true, count: ids.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.listDocs = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { page = 1, limit = 50, q, status, docType, from, to } = req.query;

        // Normalize
        const p = Math.max(1, parseInt(page, 10) || 1);
        const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

        const result = await Adapter.getDocs(project, {
            page: p, limit: l, q, status, docType, from, to
        });

        res.json(result); // { rows, total, page, limit }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.updateDoc = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const patch = req.body;

        // Consistency: if updating canonical, update legacy
        if (!patch.docType && (patch.docTypeLabel || patch.docTypeId)) {
            patch.docType = patch.docTypeLabel || patch.docTypeId;
        }
        // Normalize needsReviewDocType
        if (patch.needsReviewDocType !== undefined) {
            patch.needsReviewDocType = !!patch.needsReviewDocType;
        }

        const updated = await UniversalDocService.updateDoc(project, id, patch);
        res.json({ ok: true, row: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.deleteDoc = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const ok = await UniversalDocService.deleteDoc(project, id);
        res.json({ ok });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.viewDoc = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const doc = await UniversalDocService.getDoc(project, id);
        if (!doc) return res.status(404).send('Not found');
        if (!doc.filePath || !fs.existsSync(doc.filePath)) return res.status(404).send('File missing');

        res.contentType('application/pdf');
        res.sendFile(doc.filePath);
    } catch (e) { res.status(500).send(e.message); }
};

exports.getDocJson = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const doc = await UniversalDocService.getDoc(project, id);
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.finalizeDoc = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id, docType, docNumber, docTypeLabel, docTypeId, force, backupReason } = req.body;

        const effectiveType = docType || docTypeLabel || docTypeId;
        if (!effectiveType) throw new Error('Type (fatura/proforma/etc) required');
        if (!docNumber) throw new Error('Number required');

        const result = await UniversalDocService.finalizeDoc(project, {
            id,
            docType: effectiveType,
            docNumber,
            force,
            backupReason
        });

        res.json({ ok: true, row: result });
    } catch (e) {
        console.error('[V2 Finalize] Error:', e);
        if (e.conflict) {
            return res.json({
                ok: false,
                conflict: true,
                message: e.message,
                existing: e.existing
            });
        }
        res.status(500).json({ error: e.message });
    }
};

exports.finalizeBulk = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { items, force, backupReason } = req.body;
        if (!Array.isArray(items)) throw new Error('items[] required');

        const results = await UniversalDocService.finalizeBulk(project, items, { force, backupReason });

        // Filter out items that had conflicts
        const conflicts = results.filter(r => r.conflict);
        const hasConflict = conflicts.length > 0;

        res.json({
            ok: !hasConflict,
            conflict: hasConflict,
            results,
            conflicts: hasConflict ? conflicts : undefined
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// --- Backups API ---

exports.getBackupData = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { backupId } = req.params;
        const backup = await Adapter.getBackup(project, backupId);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });

        // Return cleaned snapshot
        const snapshot = JSON.parse(backup.data_snapshot);
        res.json({ snapshot });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.listBackups = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params; // docId
        const backups = await Adapter.getBackups(project, id);
        res.json({ ok: true, backups });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.restoreBackup = async (req, res) => {
    try {
        const knex = require('../../db/knex');
        const project = req.query.project || req.project || 'default';
        const { backupId } = req.params;

        await knex.transaction(async trx => {
            const backup = await Adapter.getBackup(project, backupId, trx);
            if (!backup) throw new Error('Backup not found');

            const snapshot = JSON.parse(backup.data_snapshot);
            const { docNumber, docType, supplier } = snapshot;

            // 1. Find the current active document that "holds the spot"
            // (Same Business Key: Number, Type, Supplier)
            const currentActive = await trx('documents')
                .where({ project, docNumber, docType, supplier })
                .first();

            // 2. Archive the current active state before replacing
            if (currentActive) {
                const { rawJson, ...cleanCurrent } = currentActive;
                await Adapter.createBackup(
                    project,
                    currentActive.id,
                    cleanCurrent,
                    `Auto-backup before restoring version from ${backup.created_at}`,
                    trx
                );
            }

            // 3. Perform REPLACEMENT
            const { rawJson: skip, id: skipId, ...cleanSnapshot } = snapshot;

            if (currentActive) {
                // Overwrite the existing row to maintain continuity
                await trx('documents').where({ id: currentActive.id }).update(cleanSnapshot);
            } else {
                // If no active version exists, recreate it
                await Adapter.saveDocument(project, cleanSnapshot, trx);
            }
        });

        res.json({ ok: true });
    } catch (e) {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(process.cwd(), 'server_debug.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] RESTORE ERROR: ${e.message}\nStack: ${e.stack}\n\n`;
        fs.appendFileSync(logPath, logEntry);

        console.error(`[RestoreBackup] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
};

exports.deleteBackup = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { backupId } = req.params;
        await Adapter.deleteBackup(project, backupId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.listDocTypes = async (req, res) => {
    try {
        const types = await ConfigService.getDocTypes(req.project || 'default');
        res.json({ types });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getLinkSuggestions = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const current = await Adapter.getDoc(project, id);
        if (!current) throw new Error('not found');

        const all = await Adapter.getDocs(project);
        const candidates = [];

        // Simple Heuristics
        const debug = req.query.debug === '1';
        const debugLog = [];

        for (const d of all) {
            if (d.id === id) continue;
            let score = 0;
            let reasons = [];

            // 1. Reference Match
            if (current.ref_json_parsed && current.ref_json_parsed.length) { // Assuming parsed or doing it now
                // (Simplified for this snippet, reusing existing logic or checking text)
            }
            if (current.references && current.references.length) {
                // legacy array or new structure
                // Use robust check
                for (const ref of current.references) {
                    if (ref.value && d.docNumber && String(d.docNumber).includes(ref.value)) {
                        score += 50;
                        reasons.push(`Ref [${ref.value}] Matches DocNumber`);
                    }
                }
            }

            // Also check if d.references matches current.docNumber
            if (current.docNumber && d.references && Array.isArray(d.references)) {
                for (const ref of d.references) {
                    if (ref.value && String(current.docNumber).includes(ref.value)) {
                        score += 50;
                        reasons.push(`DocNumber Matches Ref [${ref.value}]`);
                    }
                }
            }

            // 2. Exact Total
            if (d.total > 0 && current.total > 0 && Math.abs(d.total - current.total) < 0.01) {
                score += 20;
                reasons.push('Same Amount');
            }
            // 3. Supplier/Customer Match
            if (d.supplier && current.supplier && d.supplier === current.supplier) {
                score += 10;
                reasons.push('Same Supplier');
            }

            if (score > 0) {
                candidates.push({ ...d, score, reasons });
            } else if (debug) {
                // debugLog.push({ id: d.id, num: d.docNumber, reasons: 'No match' }); 
            }
        }

        // Sort by score
        candidates.sort((a, b) => b.score - a.score);

        const response = { candidates: candidates.slice(0, 10) };
        if (debug) {
            response.debugMap = {
                searchedCount: all.length,
                currentDoc: { id: current.id, num: current.docNumber, total: current.total, supplier: current.supplier },
                reason: candidates.length === 0 ? "No heuristic matches found (Ref / Total / Supplier)" : "Found"
            };
        }
        res.json(response);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createLink = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { fromId, toId, type } = req.body;
        // In a real implementation we would insert into doc_links
        // For fast V2, we will assume the table exists as migrated
        const knex = require('../../db/knex');
        await knex('doc_links').insert({
            id: uuidv4(),
            project,
            from_id: fromId,
            to_id: toId,
            type: type || 'related'
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createDocType = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id, labelPt, synonyms, keywords } = req.body;
        if (!id || !labelPt) throw new Error('ID and LabelPT required');

        const current = await ConfigService.getDocTypes(project);
        if (current.find(c => c.id === id)) throw new Error('DocType ID already exists');

        current.push({
            id,
            labelPt,
            synonyms: Array.isArray(synonyms) ? synonyms : [],
            keywords: Array.isArray(keywords) ? keywords : []
        });

        await ConfigService.saveDocTypes(project, current);
        res.json({ ok: true, type: transformDocType(current[current.length - 1]) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.updateDocType = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;
        const updates = req.body;

        const current = await ConfigService.getDocTypes(project);
        const idx = current.findIndex(c => c.id === id);
        if (idx === -1) throw new Error('DocType not found');

        // Merge updates
        current[idx] = { ...current[idx], ...updates, id }; // Keep ID immutable ideally, but allow updates to other fields

        await ConfigService.saveDocTypes(project, current);
        res.json({ ok: true, type: transformDocType(current[idx]) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.deleteDocType = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { id } = req.params;

        let current = await ConfigService.getDocTypes(project);
        const initialLen = current.length;
        current = current.filter(c => c.id !== id);

        if (current.length === initialLen) throw new Error('DocType not found');

        await ConfigService.saveDocTypes(project, current);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

function transformDocType(dt) {
    // Helper to ensure frontend gets consistent shape
    return {
        id: dt.id,
        labelPt: dt.labelPt,
        synonyms: dt.synonyms || [],
        keywords: dt.keywords || []
    };
}

exports.exportXlsx = async (req, res) => {
    try {
        const project = req.project || 'default';
        const { includeRaw } = req.query;
        const raw = await Adapter.getDocs(project);
        const docs =
            Array.isArray(raw) ? raw :
                Array.isArray(raw?.rows) ? raw.rows :
                    Array.isArray(raw?.items) ? raw.items :
                        Array.isArray(raw?.docs) ? raw.docs :
                            [];

        if (
            !Array.isArray(raw) &&
            !Array.isArray(raw?.rows) &&
            !Array.isArray(raw?.items) &&
            !Array.isArray(raw?.docs)
        ) {
            console.warn('[v2 export.xlsx] Unexpected docs shape:', raw);
        }

        const rows = docs.map(d => {
            const row = {
                "ID": d.id,
                "Project": d.project,
                "Status": d.status,
                "Tipo (Canonical)": d.docTypeLabel || d.docType,
                "Tipo ID": d.docTypeId || '',
                "Tipo (Raw)": d.docTypeRaw || '',
                "Nº Documento": d.docNumber,
                "Data": d.date,
                "Vencimento": d.dueDate,
                "Fornecedor": (d.supplier && typeof d.supplier === 'object') ? d.supplier.name : d.supplier,
                "Cliente": (d.customer && typeof d.customer === 'object') ? d.customer.name : d.customer,
                "Total": d.total,
                "Moeda": d.currency || 'EUR',
                "Confiança": d.confidence,
                "Método Extração": d.extractionMethod,
                "Rev. Tipologia": d.needsReviewDocType ? 'Sim' : '',
                "Ficheiro": d.origName,
                "Transaction ID": d.transactionId || '', // If linked
                "Criado Em": d.created_at,
                "Atualizado Em": d.updated_at
            };

            if (includeRaw === '1') {
                row["JSON AI"] = d.rawJson ? JSON.stringify(d.rawJson).slice(0, 32000) : ''; // Limit for Excel
                row["Referências JSON"] = d.references_json || (Array.isArray(d.references) ? JSON.stringify(d.references) : '');
            } else {
                // Simplified references for non-raw
                row["Referências"] = Array.isArray(d.references) ? d.references.map(r => `${r.type}:${r.value}`).join(', ') : '';
            }

            // Optional file path if needed for audit, but maybe sensitive
            // row["FilePath"] = d.filePath; 

            return row;
        });

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, "Core V2");

        // Perf: Stream via Temp File
        const os = require('os');
        const tmpPath = path.join(os.tmpdir(), `core-export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`);

        xlsx.writeFile(wb, tmpPath);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=core-v2-export-${Date.now()}.xlsx`);

        const stream = fs.createReadStream(tmpPath);
        stream.pipe(res);

        // Cleanup
        const cleanup = () => { if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { }); };
        stream.on('close', cleanup);
        stream.on('error', cleanup);
        res.on('finish', cleanup);
    } catch (e) {
        console.error('[v2 export.xlsx] error:', e);
        res.status(500).json({ error: e.message });
    }
};

// --- Satellite Data for Nicolazzi (Unified Storage) ---

exports.getExtractionData = async (req, res) => {
    try {
        const { type, id } = req.params;
        const data = await SatelliteStorage.getData(type, id);
        res.json(data || {});
    } catch (e) {
        console.error(`[Satellite Read] Error for doc ${req.params.id}:`, e.message);
        res.status(500).json({ error: e.message });
    }
};

exports.saveExtractionData = async (req, res) => {
    try {
        const { type, id } = req.params;
        const data = req.body;
        await SatelliteStorage.saveData(type, id, data);
        res.json({ ok: true });
    } catch (e) {
        console.error(`[Satellite Write] Error for doc ${req.params.id}:`, e.message);
        res.status(500).json({ error: e.message });
    }
};
