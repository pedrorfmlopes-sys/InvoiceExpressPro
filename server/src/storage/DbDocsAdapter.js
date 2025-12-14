const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');

class DbDocsAdapter {
    // --- Documents ---
    async getDocs(project, { page = 1, limit = 50, q, status, docType, from, to } = {}) {
        let query = knex('documents').where({ project });

        if (status) query = query.where('status', status);
        if (docType) query = query.where((b) => b.where('docType', docType).orWhere('docTypeId', docType));

        // Dates: Assume 'date' column or 'created_at'. Requirement says consistent filter.
        // Using 'date' (invoice date) as primary filter usually makes sense for business logic.
        if (from) query = query.where('date', '>=', from);
        if (to) query = query.where('date', '<=', to);

        if (q) {
            const isPg = knex.client.config.client === 'pg';
            const op = isPg ? 'ilike' : 'like'; // PG: Case-insensitive ilike, SQLite: like (default insensitive)
            const like = `%${q}%`;

            query = query.where((b) => {
                b.where('docNumber', op, like)
                    .orWhere('supplier', op, like)
                    .orWhere('customer', op, like)
                    .orWhere('origName', op, like);
            });
        }

        // Count: Must be clean
        const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
        const totalParams = await countQuery;
        const total = parseInt(totalParams.count || totalParams['count(*)'] || 0, 10);

        // Fetch
        const rows = await query.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);

        return {
            rows: rows.map(r => {
                const raw = r.rawJson ? JSON.parse(r.rawJson) : {};
                const refs = r.references_json ? JSON.parse(r.references_json) : (raw.references || []);
                return { ...raw, ...r, references: refs };
            }),
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }

    async getDoc(project, id) {
        const r = await knex('documents').where({ project, id }).first();
        if (!r) return null;
        const raw = r.rawJson ? JSON.parse(r.rawJson) : {};
        return { ...raw, ...r };
    }

    async saveDocument(project, doc) {
        if (!doc.id) doc.id = uuidv4();

        // Split known columns vs raw
        const { id, docType, docNumber, supplier, customer, date, dueDate, total, status, filePath, batchId,
            docTypeId, docTypeLabel, docTypeRaw, docTypeSource, docTypeConfidence, needsReviewDocType,
            ...rest } = doc;

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

            rawJson: JSON.stringify(doc), // Store full doc in rawJson for perfect fidelity
            updated_at: new Date()
        };

        // Upsert
        const exists = await knex('documents').where({ id }).first();
        if (exists) {
            await knex('documents').where({ id }).update(row);
        } else {
            row.created_at = new Date();
            await knex('documents').insert(row);
        }
        return doc;
    }

    async updateDoc(project, id, patch) {
        const existing = await this.getDoc(project, id);
        if (!existing) throw new Error('Document not found');
        const updated = { ...existing, ...patch };
        return await this.saveDocument(project, updated);
    }

    async deleteDoc(project, id) {
        await knex('documents').where({ project, id }).delete();
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
    async appendAudit(project, entry) {
        await knex('audit_logs').insert({
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
}

module.exports = new DbDocsAdapter();
