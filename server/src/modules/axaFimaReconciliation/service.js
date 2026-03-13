'use strict';
const knex = require('../../db/knex');
const crypto = require('crypto');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function safeParse(json, fallback = {}) {
    if (!json) return fallback;
    if (typeof json === 'object') return json;
    try { return JSON.parse(json); } catch { return fallback; }
}

/**
 * Extract the reconciliation mark (= proforma/proposal reference) from a document.
 *
 * AXA  → shippingMarks  (populated from "Ref. est." field in both OC & Invoice)
 * FIMA → metadata.client_ref  (proforma number carried in OC & Invoice)
 *        falling back to shippingMarks
 */
function getReconciliationMark(data) {
    if (!data) return null;
    const mark =
        data.shippingMarks ||
        data.metadata?.client_ref ||
        data.docRefs?.proformaNumber ||
        data.client_ref ||
        '';
    return mark.trim() || null;
}

/**
 * Extract the OC number from a document (for Invoice → OC linking).
 * FIMA invoices carry the OC number in source_docs ("Or. Cl. num. 673/00 …").
 * AXA  invoices carry it in docRefs array or shippingMarks context.
 */
function getOcNumber(data) {
    if (!data) return null;
    // FIMA: source_docs = "Ddt nr. 1243/00 del … | Or. Cl. num. 673/00 del …"
    if (data.source_docs) {
        const m = data.source_docs.match(/Or\.\s*Cl\.\s*num\.\s*([\d\/]+)/i);
        if (m) return m[1].trim();
    }
    // AXA: docRefs array with OC numbers
    if (Array.isArray(data.docRefs) && data.docRefs.length > 0) {
        return data.docRefs[0];
    }
    return data.metadata?.oc_number || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// OC Reconciliation  (Proforma → OC → Proposal confirmed)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Process an Order Confirmation document:
 *  1. Find the Proposal whose proposal_number matches the OC's proforma reference.
 *  2. Mark the proposal as "accepted" and record the OC date.
 *  3. Store the OC lines in document_lines (type='oc') for future reference.
 *
 * @param {string} ocId  – document id of the OC
 * @param {string|null} forceProposalId  – optional override
 */
async function reconcileOrderConfirmation(ocId, forceProposalId = null) {
    return await knex.transaction(async (trx) => {
        const doc = await trx('documents').where({ id: ocId }).first();
        if (!doc) throw new Error(`OC document not found: ${ocId}`);

        const data = safeParse(doc.rawJson);
        const mark = getReconciliationMark(data);

        let proposal = null;

        if (forceProposalId) {
            proposal = await trx('custom_proposals').where({ id: forceProposalId }).first();
            if (!proposal) throw new Error('Forced Proposal not found.');
        } else {
            if (!mark) return { success: false, reason: 'No proforma reference found in OC' };

            // Look for proposal in any "open" state (not yet invoiced)
            proposal = await trx('custom_proposals')
                .where('proposal_number', mark)
                .whereNotIn('status', ['cancelled', 'faturado'])
                .first();

            if (!proposal) {
                return { success: false, reason: `No proposal found for reference "${mark}"` };
            }
        }

        // Mark proposal as accepted if not already
        if (!['accepted', 'em_fornecimento', 'faturado'].includes(proposal.status)) {
            await trx('custom_proposals')
                .where({ id: proposal.id })
                .update({
                    status: 'accepted',
                    order_confirmation_date: new Date().toISOString(),
                    updated_at: new Date()
                });
        }

        // Clean & re-insert OC lines
        await trx('document_lines').where({ document_id: ocId }).del();

        const linesToInsert = (data.lines || []).map((l, idx) => ({
            id: crypto.randomUUID(),
            document_id: ocId,
            sku: (l.code || l.sku || '').trim(),
            description: l.description || '',
            quantity: parseFloat(l.quantity) || 0,
            unit_price: parseFloat(l.unitPrice || l.unit_price) || 0,
            total: parseFloat(l.total) || 0,
            metadata: JSON.stringify({
                type: 'oc',
                original_index: idx,
                proposal_id: proposal.id,
                proforma_ref: mark,
                oc_number: data.docNumber || data.orderNumber || ''
            })
        }));

        if (linesToInsert.length > 0) await trx('document_lines').insert(linesToInsert);

        console.log(`[AxaFima Recon] OC ${ocId} → Proposal "${proposal.name}" (${proposal.id}) accepted. Lines: ${linesToInsert.length}`);
        return {
            success: true,
            proposal: proposal.name,
            proposal_id: proposal.id,
            oc_lines: linesToInsert.length,
            action: proposal.status === 'accepted' ? 'already_accepted' : 'marked_accepted'
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Invoice Reconciliation  (Invoice → fulfillments on Proposal lines)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reconcile an invoice against a proposal.
 * Identical logic to Nicolazzi, just using our brand-agnostic getReconciliationMark.
 */
async function reconcileInvoice(invoiceId, forceProposalId = null) {
    return await reconcileInvoiceInternal(invoiceId, forceProposalId);
}

async function reconcileInvoiceInternal(invoiceId, forceProposalId = null, existingTrx = null) {
    const action = async (trx) => {
        const invoice = await trx('documents').where({ id: invoiceId }).first();
        if (!invoice) throw new Error('Invoice not found');

        const data = safeParse(invoice.rawJson);
        const mark = getReconciliationMark(data);
        const ocNum = getOcNumber(data);

        let proposal = null;

        if (forceProposalId) {
            proposal = await trx('custom_proposals').where({ id: forceProposalId }).first();
            if (!proposal) throw new Error('Forced Proposal not found.');
        } else {
            if (!mark) return { success: false, reason: 'No proforma reference in invoice' };

            proposal = await trx('custom_proposals')
                .where('proposal_number', mark)
                .whereIn('status', ['accepted', 'em_fornecimento'])
                .first();

            if (!proposal) return { success: false, reason: `Proposal '${mark}' not found or not accepted.` };
        }

        // Clean existing
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();

        // Insert invoice lines
        const linesToInsert = (data.lines || []).map((l, idx) => ({
            id: crypto.randomUUID(),
            document_id: invoiceId,
            sku: (l.code || l.sku || '').trim(),
            description: l.description || '',
            quantity: parseFloat(l.quantity) || 0,
            unit_price: parseFloat(l.unitPrice || l.unit_price) || 0,
            total: parseFloat(l.total) || 0,
            metadata: JSON.stringify({
                type: 'invoice',
                original_index: idx,
                proforma_ref: mark,
                oc_ref: ocNum || ''
            })
        }));

        if (linesToInsert.length > 0) await trx('document_lines').insert(linesToInsert);

        // Match by SKU → create fulfillments
        const proposalLines = await trx('proposal_lines').where({ proposal_id: proposal.id });
        const fulfillments = [];

        for (const invLine of linesToInsert) {
            if (!invLine.sku) continue;
            const pLine = proposalLines.find(
                p => (p.sku || '').trim().toUpperCase() === invLine.sku.toUpperCase()
            );
            if (pLine) {
                fulfillments.push({
                    id: crypto.randomUUID(),
                    proposal_line_id: pLine.id,
                    doc_line_id: invLine.id,
                    document_id: invoiceId,
                    proposal_id: proposal.id,
                    quantity_fulfilled: invLine.quantity
                });
            }
        }

        if (fulfillments.length > 0) await trx('proposal_fulfillments').insert(fulfillments);

        console.log(`[AxaFima Recon] Invoice ${invoiceId} → Proposal "${proposal.name}". Matched: ${fulfillments.length}/${linesToInsert.length}`);
        return {
            success: true,
            proposal: proposal.name,
            proposal_id: proposal.id,
            total_lines: linesToInsert.length,
            matched_lines: fulfillments.length
        };
    };

    if (existingTrx) return await action(existingTrx);
    return await knex.transaction(action);
}

// ──────────────────────────────────────────────────────────────────────────────
// Reports & Queries  (reuse Nicolazzi logic, filtered to AXA/FIMA brands)
// ──────────────────────────────────────────────────────────────────────────────

const BRANDS = ['AXA', 'FIMA', 'axa', 'fima'];

/**
 * Reconciliation report: same as Nicolazzi but scoped to AXA/FIMA proposals.
 */
async function getReconciliationReport() {
    const proposals = await knex('custom_proposals')
        .where(function () {
            this.where('brand_id', 'like', '%axa%')
                .orWhere('brand_id', 'like', '%fima%')
                .orWhere('brand_id', 'like', '%AXA%')
                .orWhere('brand_id', 'like', '%FIMA%');
        })
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref', 'created_at', 'status');

    if (!proposals.length) return [];

    const proposalIds = proposals.map(p => p.id);

    const orderedStats = await knex('proposal_lines')
        .whereIn('proposal_id', proposalIds)
        .groupBy('proposal_id')
        .select('proposal_id', knex.raw('SUM(quantity) as total_items'));

    const orderedMap = new Map(orderedStats.map(s => [s.proposal_id, parseFloat(s.total_items || 0)]));

    const fulfilledStats = await knex('proposal_fulfillments')
        .whereIn('proposal_id', proposalIds)
        .groupBy('proposal_id')
        .select('proposal_id', knex.raw('SUM(quantity_fulfilled) as total_fulfilled'));

    const fulfilledMap = new Map(fulfilledStats.map(s => [s.proposal_id, parseFloat(s.total_fulfilled || 0)]));

    return proposals.map(p => {
        const totalItems = orderedMap.get(p.id) || 0;
        const totalFulfilled = fulfilledMap.get(p.id) || 0;
        const progress = totalItems > 0 ? Math.min(100, (totalFulfilled / totalItems) * 100) : 0;
        return {
            id: p.id,
            proposal_number: p.proposal_number || p.name,
            client_ref: p.client_ref,
            total_items: totalItems,
            fulfilled_items: totalFulfilled,
            progress: parseFloat(progress.toFixed(1)),
            status: progress >= 100 ? 'completed' : progress > 0 ? 'partial' : 'pending',
            created_at: p.created_at
        };
    });
}

/**
 * Discover unlinked AXA/FIMA invoices that potentially match a proposal.
 */
async function discoverMatches() {
    const linkedDocIdsQuery = knex('proposal_fulfillments').select('document_id').distinct();

    const unlinked = await knex('documents')
        .where(function () {
            this.where('supplier', 'like', '%AXA%')
                .orWhere('supplier', 'like', '%FIMA%')
                .orWhere('supplier', 'like', '%axa%')
                .orWhere('supplier', 'like', '%fima%');
        })
        .whereIn('docType', ['invoice', 'fatura', 'axa_invoice', 'fima_invoice'])
        .whereNotIn('id', linkedDocIdsQuery)
        .orderBy('created_at', 'desc');

    const matches = [];
    for (const inv of unlinked) {
        const data = safeParse(inv.rawJson);
        const mark = getReconciliationMark(data);

        let match = null;
        if (mark && mark.length > 2) {
            match = await knex('custom_proposals')
                .where('proposal_number', mark)
                .whereIn('status', ['accepted', 'em_fornecimento'])
                .first();
        }

        matches.push({
            invoice: {
                id: inv.id,
                date: data.date || inv.date,
                number: data.docNumber || inv.docNumber || 'Sem Nº',
                shipping_mark: mark,
                total: data.totals?.gross || inv.total || 0,
                project: inv.project,
                supplier: inv.supplier
            },
            proposal: match ? {
                id: match.id,
                number: match.proposal_number,
                client_ref: match.client_ref,
                name: match.name
            } : null
        });
    }

    matches.sort((a, b) => (a.proposal && !b.proposal ? -1 : !a.proposal && b.proposal ? 1 : 0));
    return matches;
}

/**
 * Discover unlinked OCs that potentially match a proposal.
 */
async function discoverOcMatches() {
    const unlinked = await knex('documents')
        .where(function () {
            this.where('supplier', 'like', '%AXA%')
                .orWhere('supplier', 'like', '%FIMA%');
        })
        .whereIn('docType', ['axa_c_pedido', 'fima_c_pedido', 'order_confirmation'])
        .orderBy('created_at', 'desc');

    const matches = [];
    for (const oc of unlinked) {
        const data = safeParse(oc.rawJson);
        const mark = getReconciliationMark(data);

        let match = null;
        if (mark && mark.length > 2) {
            match = await knex('custom_proposals')
                .where('proposal_number', mark)
                .whereNotIn('status', ['cancelled', 'faturado'])
                .first();
        }

        matches.push({
            oc: {
                id: oc.id,
                date: data.date || oc.date,
                number: data.docNumber || data.orderNumber || oc.docNumber || 'Sem Nº',
                shipping_mark: mark,
                project: oc.project,
                supplier: oc.supplier
            },
            proposal: match ? {
                id: match.id,
                number: match.proposal_number,
                status: match.status,
                name: match.name
            } : null
        });
    }

    matches.sort((a, b) => (a.proposal && !b.proposal ? -1 : !a.proposal && b.proposal ? 1 : 0));
    return matches;
}

/**
 * Unlink an invoice (or OC) — removes its document_lines and fulfillments.
 */
async function unlinkDocument(docId) {
    return await knex.transaction(async (trx) => {
        await trx('proposal_fulfillments').where({ document_id: docId }).del();
        await trx('document_lines').where({ document_id: docId }).del();
        return { success: true };
    });
}

/**
 * Reset all AXA/FIMA matchings and re-run reconciliation.
 */
async function resetAllMatchings() {
    return await knex.transaction(async (trx) => {
        const docs = await trx('documents')
            .where(function () {
                this.where('supplier', 'like', '%AXA%')
                    .orWhere('supplier', 'like', '%FIMA%');
            })
            .whereIn('docType', ['invoice', 'fatura', 'axa_invoice', 'fima_invoice', 'axa_c_pedido', 'fima_c_pedido'])
            .select('id', 'docType');

        const docIds = docs.map(d => d.id);
        if (docIds.length > 0) {
            await trx('proposal_fulfillments').whereIn('document_id', docIds).del();
            await trx('document_lines').whereIn('document_id', docIds).del();
        }

        let successCount = 0;
        for (const doc of docs) {
            try {
                const isOc = ['axa_c_pedido', 'fima_c_pedido', 'order_confirmation'].includes(doc.docType);
                if (isOc) {
                    await reconcileOrderConfirmation(doc.id);
                } else {
                    await reconcileInvoiceInternal(doc.id, null, trx);
                }
                successCount++;
            } catch (err) {
                console.error(`[AxaFima Recon] Reset failed for doc ${doc.id}:`, err.message);
            }
        }

        return { success: true, processed: successCount };
    });
}

module.exports = {
    reconcileOrderConfirmation,
    reconcileInvoice,
    getReconciliationReport,
    discoverMatches,
    discoverOcMatches,
    unlinkDocument,
    resetAllMatchings
};
