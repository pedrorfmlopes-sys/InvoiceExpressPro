const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');

class TransactionsService {
    // Helper to log event
    async _logEvent(trx, { orgId, project, transactionId, kind, payload }) {
        await trx('transaction_events').insert({
            orgId,
            project,
            transactionId,
            ts: new Date().toISOString(),
            kind,
            payloadJson: JSON.stringify(payload || {})
        });
    }

    async list({ orgId, project, q, status }) {
        let query = knex('transactions')
            .where({ orgId, project })
            .orderBy('updated_at', 'desc');

        if (status) {
            query = query.where({ status });
        }
        if (q) {
            query = query.where(builder => {
                builder.where('title', 'like', `%${q}%`)
                    .orWhere('counterparty', 'like', `%${q}%`);
            });
        }

        const rows = await query;

        // Count docs (could be optimized with join)
        for (const row of rows) {
            const count = await knex('transaction_links')
                .where({ transactionId: row.id })
                .count('id as c')
                .first();
            row.docCount = count.c;
        }
        return rows;
    }

    async get({ orgId, project, id }) {
        const transaction = await knex('transactions').where({ orgId, project, id }).first();
        if (!transaction) return null;

        const links = await knex('transaction_links')
            .where({ transactionId: id })
            .orderBy('created_at', 'desc');

        const events = await knex('transaction_events')
            .where({ transactionId: id })
            .orderBy('ts', 'desc')
            .limit(50); // Cap history

        return { ...transaction, links, events: events.map(e => ({ ...e, payload: JSON.parse(e.payloadJson || '{}') })) };
    }

    async create({ orgId, project, title, description, counterparty }) {
        const id = uuidv4();
        return knex.transaction(async trx => {
            const row = {
                id,
                orgId,
                project,
                title,
                description: description || '',
                counterparty: counterparty || '',
                status: 'open'
            };
            await trx('transactions').insert(row);
            await this._logEvent(trx, { orgId, project, transactionId: id, kind: 'created', payload: row });
            return row;
        });
    }

    async update({ orgId, project, id, patch }) {
        const { title, description, counterparty, status } = patch;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (counterparty !== undefined) updates.counterparty = counterparty;
        if (status !== undefined) updates.status = status;

        updates.updated_at = new Date();

        return knex.transaction(async trx => {
            await trx('transactions')
                .where({ orgId, project, id })
                .update(updates);

            await this._logEvent(trx, { orgId, project, transactionId: id, kind: 'updated', payload: updates });

            return this.get({ orgId, project, id }); // Return full object
        });
    }

    async linkDoc({ orgId, project, transactionId, documentId, linkType, source, confidence }) {
        return knex.transaction(async trx => {
            // Check if already linked
            const existing = await trx('transaction_links')
                .where({ transactionId, documentId })
                .first();

            if (existing) return existing;

            const row = {
                orgId,
                project,
                transactionId,
                documentId,
                linkType: linkType || 'related',
                source: source || 'manual',
                confidence: confidence || 1.0
            };
            await trx('transaction_links').insert(row);
            await this._logEvent(trx, { orgId, project, transactionId, kind: 'linked', payload: { documentId, source } });

            // Touch transaction to update 'updated_at'
            await trx('transactions').where({ id: transactionId }).update({ updated_at: new Date() });

            return row;
        });
    }

    async unlinkDoc({ orgId, project, transactionId, documentId }) {
        return knex.transaction(async trx => {
            const deleted = await trx('transaction_links')
                .where({ transactionId, documentId })
                .delete();

            if (deleted) {
                await this._logEvent(trx, { orgId, project, transactionId, kind: 'unlinked', payload: { documentId } });
                await trx('transactions').where({ id: transactionId }).update({ updated_at: new Date() });
            }
        });
    }

    async listForDoc({ orgId, project, documentId }) {
        // Find links
        const links = await knex('transaction_links').where({ orgId, project, documentId });
        const ids = links.map(l => l.transactionId);

        if (ids.length === 0) return [];

        return knex('transactions').whereIn('id', ids);
    }
}

module.exports = new TransactionsService();
