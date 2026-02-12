const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('./SatelliteStorage');

class DbDocsAdapter {
    // --- Documents ---
    async getDocs(project, { page = 1, limit = 50, q, status, docType, from, to } = {}, trx = null) {
        // Base Query (Filters only)
        const db = trx || knex;
        let baseQuery = db('documents').where({ project });

        if (status) baseQuery = baseQuery.where('status', status);
        if (docType) baseQuery = baseQuery.where((b) => b.where('docType', docType).orWhere('docTypeId', docType));

        if (from) baseQuery = baseQuery.where('date', '>=', from);
        if (to) baseQuery = baseQuery.where('date', '<=', to);

        if (q) {
            const isPg = knex.client.config.client === 'pg';
            const op = isPg ? 'ilike' : 'like';
            const like = `%${q}%`;

            baseQuery = baseQuery.where((b) => {
                b.where('docNumber', op, like)
                    .orWhere('supplier', op, like)
                    .orWhere('customer', op, like);
            });
        }

        // Count (Clean clone)
        const countQuery = baseQuery.clone().clearSelect().clearOrder().count('* as count').first();
        const totalParams = await countQuery;
        const total = parseInt(totalParams.count || totalParams['count(*)'] || 0, 10);

        // Fetch Rows (Apply pagination to clone)
        const rows = await baseQuery.clone().orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);

        return {
            rows: rows.map(r => {
                const { rawJson: rawStr, references_json, ...row } = r;
                let raw = {};
                try {
                    raw = rawStr ? JSON.parse(rawStr) : {};
                } catch (e) {
                    console.error("[Adapter] Failed to parse rawJson", e);
                }

                const refs = references_json ? JSON.parse(references_json) : (raw.references || []);

                // RESTORE rawJson as object for Viewer compatibility
                // but keep it clean from string/nesting
                const docWithRaw = { ...raw, ...row, references: refs };
                docWithRaw.rawJson = { ...raw };

                return docWithRaw;
            }),
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }

    async getDoc(project, id, trx = null) {
        const db = trx || knex;
        console.log(`[Adapter] getDoc searching for: project=${project}, id=${id}`);
        const r = await db('documents').where({ project, id }).first();
        if (!r) {
            console.log(`[Adapter] getDoc NOT FOUND for: project=${project}, id=${id}`);
            return null;
        }
        const { rawJson: rawStr, ...row } = r;
        let raw = {};
        try {
            raw = rawStr ? JSON.parse(rawStr) : {};
        } catch (e) {
            console.error("[Adapter] Failed to parse rawJson in getDoc", e);
        }

        let docWithRaw = { ...raw, ...row };

        // --- SMART MERGE (Phase 17/27) ---
        // If specialized brand, merge latest from satellite
        const satelliteTypes = ['nicolazzi_proformas', 'nicolazzi_invoices'];
        for (const type of satelliteTypes) {
            try {
                const satData = await SatelliteStorage.getData(type, id);
                if (satData) {
                    // console.log(`[Adapter] Smart Merge: Found ${type} data for ${id}`);
                    const { rawJson: satRaw, ...cleanSat } = satData;
                    docWithRaw = { ...docWithRaw, ...cleanSat };
                    break;
                }
            } catch (e) { /* ignore single sat load failure */ }
        }

        docWithRaw.rawJson = { ...raw }; // Restore for viewer
        return docWithRaw;
    }

    async saveDocument(project, doc, trx = null) {
        if (!doc.id) doc.id = uuidv4();

        // 1. CLEAN GATE: Strip any recursion/nesting attempts
        const { id, docType, docNumber, supplier, customer, date, dueDate, total, status, filePath, batchId,
            docTypeId, docTypeLabel, docTypeRaw, docTypeSource, docTypeConfidence, needsReviewDocType,
            rawJson: skipJson, raw_data: skipRaw, ...rest } = doc;

        // Safe defaults
        const suppliersName = (supplier && typeof supplier === 'object') ? supplier.name : supplier;
        const customersName = (customer && typeof customer === 'object') ? customer.name : customer;
        const refsJson = (rest.references) ? JSON.stringify(rest.references) : (rest.references_json || null);

        const row = {
            id,
            project,
            docType,
            docNumber,
            supplier: suppliersName,
            customer: customersName,
            date,
            dueDate,
            total,
            status,
            filePath,
            batchId,
            references_json: refsJson,
            // V2.2 Canonical Fields
            docTypeId,
            docTypeLabel,
            docTypeRaw,
            docTypeSource,
            docTypeConfidence,
            needsReviewDocType,

            rawJson: JSON.stringify({ ...rest, id, docType, docNumber, supplier: suppliersName, customer: customersName, date, dueDate, total, status, filePath, batchId, docTypeId, docTypeLabel, docTypeRaw, docTypeSource, docTypeConfidence, needsReviewDocType }), // Store clean flat version
            updated_at: new Date()
        };

        // Upsert Main DB
        const db = trx || knex;
        const exists = await db('documents').where({ id }).first();
        if (exists) {
            await db('documents').where({ id }).update(row);
        } else {
            row.created_at = new Date();
            await db('documents').insert(row);
        }

        // --- WRITE-THROUGH CACHING (Phase 27) ---
        // If it's a specialized document being V2 validated, we ALSO save to satellite
        // This keeps the specialized viewer (Nicolazzi) in sync without a manual "consoldiate" event.
        if (doc.supplier && /NICOLAZZI/i.test(suppliersName)) {
            const satType = /PROFORMA/i.test(doc.docType || doc.docTypeLabel) ? 'nicolazzi_proformas' : 'nicolazzi_invoices';
            try {
                await SatelliteStorage.saveData(satType, id, { ...doc, id, project });
                // console.log(`[Adapter] Write-Through: Saved to ${satType}`);
            } catch (e) {
                console.warn(`[Adapter] Write-Through failed for ${satType}:`, e.message);
            }
        }

        return doc;
    }

    async updateDoc(project, id, patch, trx = null) {
        const existing = await this.getDoc(project, id, trx);
        if (!existing) throw new Error('Document not found');

        // recursion prevention: ignore old rawJson before merge
        const { rawJson: oldJson, ...cleanExisting } = existing;
        const updated = { ...cleanExisting, ...patch };

        return await this.saveDocument(project, updated, trx);
    }

    async deleteDoc(project, id, trx = null) {
        const db = trx || knex;
        await db('documents').where({ project, id }).delete();
    }

    // --- Normalize Rules ---
    async getNormalizeRules(project) {
        return await knex('normalize_rules').where({ project });
    }

    async upsertNormalizeRule(project, rule) {
        // Simple insert for now, or check alias existence
        await knex('normalize_rules').insert({
            project,
            kind: rule.kind,
            alias: rule.alias,
            canonical: rule.canonical,
            created_at: new Date(),
            updated_at: new Date()
        });
    }

    // --- Audit ---
    async appendAudit(project, entry, trx = null) {
        const db = trx || knex;
        await db('audit_logs').insert({
            project,
            ts: entry.ts || new Date().toISOString(),
            action: entry.action,
            payloadJson: JSON.stringify(entry)
        });
    }

    async getAudit(project, limit = 100) {
        const rows = await knex('audit_logs').where({ project }).orderBy('id', 'desc').limit(limit);
        return rows.map(r => r.payloadJson ? JSON.parse(r.payloadJson) : r);
    }

    // --- Secrets ---
    async getSecrets(project) {
        const row = await knex('config_secrets').where({ project }).first();
        if (!row) return {};
        return { openaiApiKey: row.openaiApiKeyEncrypted }; // "Encrypted" but simplified for now
    }

    async saveSecrets(project, secrets) {
        const row = {
            project,
            openaiApiKeyEncrypted: secrets.openaiApiKey,
            updated_at: new Date()
        };
        const exists = await knex('config_secrets').where({ project }).first();
        if (exists) {
            await knex('config_secrets').where({ project }).update(row);
        } else {
            await knex('config_secrets').insert(row);
        }
    }

    // --- Cleanup ---
    async resetProjectData(project) {
        // Order matters for FKs if enforced, though SQLite usually permissive unless PRAGMA enabled.
        // Safer to delete children first.
        await knex('doc_links').whereIn('doc_id', function () {
            this.select('id').from('documents').where({ project });
        }).delete();

        // Also delete links where this project is the grouping? 
        // Current doc_links schema is (id, doc_id, group_id).
        // If we delete docs, we delete their links.

        await knex('document_backups').where({ project }).delete();
        await knex('transactions').where({ project }).delete();
        await knex('documents').where({ project }).delete();
        // Optional: Sub-projects/Categories are considered "Config" usually, so we keep them unless "Delete Project".
    }

    // --- Backups ---
    async createBackup(project, docId, data, reason = 'Automatic Backup', trx = null) {
        const id = uuidv4();
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + 15); // 15 days retention

        const db = trx || knex;
        await db('document_backups').insert({
            id,
            project,
            original_doc_id: docId,
            data_snapshot: JSON.stringify(data),
            reason,
            created_at: new Date(),
            expires_at
        });
        return id;
    }

    async getBackups(project, docId, trx = null) {
        const db = trx || knex;
        return await db('document_backups')
            .where({ project, original_doc_id: docId })
            .orderBy('created_at', 'desc');
    }

    async getBackup(project, backupId, trx = null) {
        const db = trx || knex;
        return await db('document_backups').where({ project, id: backupId }).first();
    }

    async deleteBackup(project, backupId, trx = null) {
        const db = trx || knex;
        await db('document_backups').where({ project, id: backupId }).delete();
    }

    async cleanupExpiredBackups() {
        const now = new Date();
        const deleted = await knex('document_backups').where('expires_at', '<', now).delete();
        if (deleted > 0) {
            console.log(`[Backups] Cleaned up ${deleted} expired backups.`);
        }
        return deleted;
    }
}

module.exports = new DbDocsAdapter();
