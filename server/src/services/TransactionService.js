const { v4: uuidv4 } = require('uuid');
const knex = require('../db/knex');

class TransactionService {

    // 1. Create Transaction
    static async createTransaction(project, data) {
        const id = uuidv4();
        await knex('transactions').insert({
            id,
            project,
            orgId: project, // Legacy schema requirement
            title: data.title || 'Untitled Transaction',
            status: data.status || 'open',
            customer_name: data.customer_name,
            supplier_name: data.supplier_name
        });
        return this.getTransaction(project, id);
    }

    // 2. Get Transaction with Docs
    static async getTransaction(project, id) {
        const tx = await knex('transactions').where({ id, project }).first();
        if (!tx) throw new Error('not found');

        const docs = await knex('transaction_docs')
            .join('documents', 'transaction_docs.doc_id', 'documents.id')
            .where('transaction_docs.transaction_id', id)
            .select('documents.*', 'transaction_docs.role', 'transaction_docs.created_at as linked_at');

        return { ...tx, docs };
    }

    // 3. List Transactions
    static async listTransactions(project, filter = {}) {
        let q = knex('transactions').where({ project }).orderBy('created_at', 'desc');
        if (filter.status) q = q.where('status', filter.status);
        return q;
    }

    // 4. Add Document
    static async addDocument(project, txId, docId, role = null) {
        // Verify ownership
        const doc = await knex('documents').where({ id: docId, project }).first();
        if (!doc) throw new Error('Document not found');

        // Prevent dupes
        const exists = await knex('transaction_docs').where({ transaction_id: txId, doc_id: docId }).first();
        if (exists) return; // already linked

        await knex('transaction_docs').insert({
            transaction_id: txId,
            doc_id: docId,
            role
        });
    }

    // 5. Remove Document
    static async removeDocument(project, txId, docId) {
        await knex('transaction_docs').where({ transaction_id: txId, doc_id: docId }).delete();
    }

    // 6. Suggest Auto-Link
    static async suggestLinks(project, docId) {
        const doc = await knex('documents').where({ id: docId, project }).first();
        if (!doc) throw new Error('Doc not found');

        // Logic handled in controller or enhanced here?
        // Let's query potential matches
        // Match by References (Exact Value Match)
        let candidates = [];

        // Extract Refs from JSON
        let refs = [];
        try {
            refs = JSON.parse(doc.references_json || '[]');
        } catch (e) {
            // fallback if stored as old array
        }

        if (refs.length > 0) {
            for (const ref of refs) {
                // Search docs where docNumber contains val OR refs contains val
                // For simplification, let's look for docNumber matches
                const matches = await knex('documents')
                    .where('project', project)
                    .whereNot('id', docId) // exclude self
                    .where('docNumber', 'like', `%${ref.value}%`)
                    .limit(5);

                matches.forEach(m => candidates.push({ doc: m, reason: `Ref Validation: Matches ${ref.type} ${ref.value}`, score: 0.9 }));
            }
        }

        return candidates;
    }
}

module.exports = TransactionService;
