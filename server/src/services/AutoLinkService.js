const knex = require('../db/knex');
const TransactionsService = require('./TransactionsService');
const DbDocsAdapter = require('../storage/DbDocsAdapter'); // To get docs

class AutoLinkService {
    // Provide suggestions
    async suggest({ orgId, project, transactionId, threshold = 0.5 }) {
        // 1. Get Transaction
        const transaction = await TransactionsService.get({ orgId, project, id: transactionId });
        if (!transaction) throw new Error('Transaction not found');

        // 2. Get All Docs (Filtered by project)
        // Optimization: In real app, we would query DB directly with filters.
        // For Phase 4 speed, we reuse Adapter.getDocs or query 'documents' table directly via Knex
        const allDocs = await knex('documents').where({ project });

        // Exclude already linked
        const linkedIds = new Set(transaction.links.map(l => l.documentId));
        const candidates = allDocs.filter(d => !linkedIds.has(d.id));

        const suggestions = [];

        // 3. Heuristics
        for (const doc of candidates) {
            let score = 0;
            const reasons = [];

            // A. Entity Match (Counterparty vs Supplier/Customer)
            if (transaction.counterparty) {
                const cp = transaction.counterparty.toLowerCase().trim();
                const sup = (doc.supplier || '').toLowerCase().trim();
                const cust = (doc.customer || '').toLowerCase().trim();

                if (sup.includes(cp) || cp.includes(sup) || cust.includes(cp) || cp.includes(cust)) {
                    score += 0.6;
                    reasons.push('Entity Match');
                }
            }

            // B. Date Proximity (uses Transaction `updated_at` or `created_at`? No, maybe transaction implies a period?
            // Heuristic: If transaction has other linked docs, compare dates.
            // If empty, match transaction creation?
            // Let's assume transaction 'updated_at' is relevant OR if we had a date field.
            // For now, skip complex date logic unless requested. Prompt said: "datas próximas (+-30 dias)". 
            // Relative to what? Assuming transaction.created_at
            const txDate = new Date(transaction.created_at);
            const docDate = new Date(doc.date || doc.createdAt || 0);
            const diffDays = Math.abs(txDate - docDate) / (1000 * 60 * 60 * 24);
            if (diffDays <= 30) {
                score += 0.3;
                reasons.push('Date Proximity');
            }

            // C. Text Match (Title vs docNumber/Ref)
            if (transaction.title && doc.docNumber && transaction.title.includes(doc.docNumber)) {
                score += 0.8;
                reasons.push('Ref Match in Title');
            }

            if (score >= threshold) {
                suggestions.push({
                    documentId: doc.id,
                    confidence: Math.min(score, 1.0),
                    reason: reasons.join(', '),
                    suggestedLinkType: 'related'
                });
            }
        }

        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }

    async apply({ orgId, project, transactionId, threshold }) {
        const suggestions = await this.suggest({ orgId, project, transactionId, threshold });
        const applied = [];

        for (const s of suggestions) {
            await TransactionsService.linkDoc({
                orgId,
                project,
                transactionId,
                documentId: s.documentId,
                linkType: s.suggestedLinkType,
                source: 'auto',
                confidence: s.confidence
            });
            applied.push(s);
        }

        return applied;
    }
}

module.exports = new AutoLinkService();
