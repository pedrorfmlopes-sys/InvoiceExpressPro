const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');

class DbDocsAdapter {
    // --- Documents ---
    async getDocs(project) {
        const rows = await knex('documents').where({ project });
        // Hydrate from rawJson if needed, but for listing mostly standard fields are enough.
        // Legacy compatibility: merge rawJson with columns
        return rows.map(r => {
            const raw = r.rawJson ? JSON.parse(r.rawJson) : {};
            return { ...raw, ...r }; // DB columns override raw if present
        });
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
        const { id, docType, docNumber, supplier, customer, date, dueDate, total, status, filePath, batchId, ...rest } = doc;

        // Safe defaults
        const suppliersName = typeof supplier === 'object' ? supplier.name : supplier;
        const customersName = typeof customer === 'object' ? customer.name : customer;

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
