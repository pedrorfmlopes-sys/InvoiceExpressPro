const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');
const {
    buildValidFulfillmentsQuery,
    getValidFulfillmentStatsByProposalIds
} = require('../modules/reconciliation/fulfillmentIntegrity');

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

        // --- PHASE 21: Fetch associated proposals ---
        const docIds = rows.map(r => r.id);
        let proposalsMap = {};
        if (docIds.length > 0) {
            // 1. Direct clones
            const clonedProposals = await db('custom_proposals')
                .whereIn('original_doc_id', docIds)
                .select('id', 'name', 'status', 'original_doc_id');

            clonedProposals.forEach(p => {
                const docId = p.original_doc_id;
                if (!proposalsMap[docId]) proposalsMap[docId] = [];
                proposalsMap[docId].push(p);
            });

            // 2. Fulfillments (linked via reconciliation)
            const fulfillmentLinks = await buildValidFulfillmentsQuery(db)
                .join('custom_proposals', 'pf.proposal_id', 'custom_proposals.id')
                .whereIn('pf.document_id', docIds)
                .select(
                    'custom_proposals.id',
                    'custom_proposals.name',
                    'custom_proposals.status',
                    'pf.document_id'
                )
                .distinct();

            fulfillmentLinks.forEach(p => {
                const docId = p.document_id;
                if (!proposalsMap[docId]) proposalsMap[docId] = [];
                if (!proposalsMap[docId].some(existing => existing.id === p.id)) {
                    proposalsMap[docId].push(p);
                }
            });

            // Enrichment: Calculate progress for each proposal
            const allFetchedProposals = Object.values(proposalsMap).flat();
            const proposalIds = [...new Set(allFetchedProposals.map(p => p.id))];
            if (proposalIds.length > 0) {
                const linesStats = await db('proposal_lines')
                    .whereIn('proposal_id', proposalIds)
                    .groupBy('proposal_id')
                    .select('proposal_id', db.raw('SUM(quantity) as total_qty'));

                const fulfillStats = await getValidFulfillmentStatsByProposalIds(proposalIds, db);

                const linesMap = {};
                linesStats.forEach(s => linesMap[s.proposal_id] = parseFloat(s.total_qty || 0));

                const fulfillMap = {};
                fulfillStats.forEach(s => fulfillMap[s.proposal_id] = parseFloat(s.total_fulfilled || 0));

                allFetchedProposals.forEach(p => {
                    const total = linesMap[p.id] || 0;
                    const fulfilled = fulfillMap[p.id] || 0;
                    p.progress = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
                });
            }
        }

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
                return {
                    ...raw,
                    ...row,
                    references: refs,
                    associatedProposals: proposalsMap[r.id] || [],
                    rawJson: { ...raw }
                };
            }),
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }

    async getDoc(project, id, trx = null) {
        const db = trx || knex;
        const query = { id };
        if (project && project !== 'all') query.project = project;

        const r = await db('documents').where(query).first();
        if (!r) return null;

        const { rawJson: rawStr, ...row } = r;
        let raw = {};
        try {
            raw = rawStr ? JSON.parse(rawStr) : {};
        } catch (e) {
            console.error("[Adapter] Failed to parse rawJson in getDoc", e);
        }

        // 1. Direct clones
        const clonedProposals = await db('custom_proposals')
            .where({ original_doc_id: id })
            .select('id', 'name', 'status');

        // 2. Fulfillments
        const fulfillmentLinks = await buildValidFulfillmentsQuery(db)
            .join('custom_proposals', 'pf.proposal_id', 'custom_proposals.id')
            .where('pf.document_id', id)
            .select('custom_proposals.id', 'custom_proposals.name', 'custom_proposals.status')
            .distinct();

        // Merge and deduplicate
        const associatedProposals = [...clonedProposals];
        fulfillmentLinks.forEach(p => {
            if (!associatedProposals.some(existing => existing.id === p.id)) {
                associatedProposals.push(p);
            }
        });

        // --- STORAGE UNIFICATION (Phase 2): No more Satellite Merges ---
        // The Main DB (documents table) is now the Single Source of Truth for both Staging and Final.
        // We rely on 'rawJson' being up-to-date from the unified save logic.

        return {
            ...raw,
            ...row,
            associatedProposals,
            rawJson: { ...raw }
        };
    }

    async saveDocument(project, doc, trx = null) {
        if (!doc.id) doc.id = uuidv4();

        // 1. CLEAN GATE: Strip any recursion/nesting attempts
        const { id, docType, docNumber, supplier, customer, date, dueDate, total, status, filePath, batchId,
            docTypeId, docTypeLabel, docTypeRaw, docTypeSource, docTypeConfidence, needsReviewDocType,
            rawJson, raw_data: skipRaw, ...rest } = doc;

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

            rawJson: JSON.stringify({
                ...rest,
                ...(typeof rawJson === 'object' ? rawJson : {}),
                id, docType, docNumber, supplier: suppliersName, customer: customersName, date, dueDate, total, status, filePath, batchId, docTypeId, docTypeLabel, docTypeRaw, docTypeSource, docTypeConfidence, needsReviewDocType
            }), // Store clean flat version
            updated_at: new Date()
        };

        // Upsert Main DB
        const db = trx || knex;
        const exists = await db('documents').where({ id }).first();

        if (exists) {
            // --- AUTO-BACKUP (Phase 2): Throttled ---
            const reason = (exists.status === 'staging' || exists.status === 'extracted')
                ? 'Rascunho Automático'
                : 'Atualização de Documento';

            try {
                // Throttle: Only backup if last update was > 15 mins ago OR status changed
                const lastUpdate = exists.updated_at ? new Date(exists.updated_at) : new Date(0);
                const thirtyMins = 30 * 60 * 1000;
                const statusChanged = exists.status !== status;
                const shouldBackup = statusChanged || (new Date() - lastUpdate > thirtyMins);

                if (shouldBackup) {
                    let existingRaw = {};
                    try { existingRaw = JSON.parse(exists.rawJson || '{}'); } catch (e) { }
                    const fullSnapshot = { ...existingRaw, ...exists };
                    await this.createBackup(project, id, fullSnapshot, reason, trx);
                }
            } catch (backupErr) {
                console.warn(`[Adapter] Failed to create auto-backup for ${id}:`, backupErr);
                // Non-blocking: proceed with save
            }

            await db('documents').where({ id }).update(row);
        } else {
            row.created_at = new Date();
            await db('documents').insert(row);
        }

        // --- STORAGE UNIFICATION: Satellite Write-Through Removed ---
        // We no longer write to SatelliteStorage. Main DB is the only persistence layer.

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
        await db('proposal_fulfillments').where({ document_id: id }).delete();
        await db('document_lines').where({ document_id: id }).delete();
        await db('doc_links').where({ doc_id: id }).delete();
        await db('transaction_links').where({ documentId: id }).delete();
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
    // --- Settings ---
    async getSettings(project, trx = null) {
        const db = trx || knex;
        const row = await db('project_settings').where({ project }).first();
        if (!row) return { backupRetentionDays: 30 };
        return { backupRetentionDays: row.backup_retention_days || 30 };
    }

    async saveSettings(project, { backupRetentionDays }) {
        const row = {
            project,
            backup_retention_days: backupRetentionDays,
            updated_at: new Date()
        };
        const exists = await knex('project_settings').where({ project }).first();
        if (exists) {
            await knex('project_settings').where({ project }).update(row);
        } else {
            row.created_at = new Date();
            await knex('project_settings').insert(row);
        }
    }

    // --- Backups ---
    async createBackup(project, docId, data, reason = 'Automatic Backup', trx = null) {
        const id = uuidv4();

        // Calculate expiration based on settings (or default 30)
        let retention = 30;
        try {
            const settings = await this.getSettings(project, trx);
            if (settings.backupRetentionDays) retention = settings.backupRetentionDays;
        } catch (e) { }

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + retention);

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

        // Trigger Cleanup (Probabilistic or less frequent)
        if (Math.random() < 0.05) { // 5% chance on save to cleanup, reducing DB pressure
            this.cleanupExpiredBackups(project).catch(err => console.error("Backup cleanup error", err));
        }

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

    async cleanupExpiredBackups(project) {
        const now = new Date();
        const db = knex; // Use default connection outside request scope

        let query = db('document_backups').where('expires_at', '<', now);

        if (project) {
            query = query.andWhere({ project });
        }

        const deleted = await query.delete();

        if (deleted > 0) {
            // console.log(`[Backups] Cleaned up ${deleted} expired backups (Project: ${project || 'ALL'}).`);
        }
        return deleted;
    }
}

module.exports = new DbDocsAdapter();
