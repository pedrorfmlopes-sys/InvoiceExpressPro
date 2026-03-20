const knex = require('../../db/knex');
const crypto = require('crypto');

function safeParse(json, fallback = {}) {
    if (!json) return fallback;
    if (typeof json === 'object') return json;
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error('[Scarabeo Recon] JSON Parse Error:', e.message);
        return fallback;
    }
}

function getReconciliationMark(data) {
    if (!data) return null;
    // Scarabeo extracts into shippingMarks (primary) and projectRef (secondary)
    return (data.shippingMarks || data.projectRef || '').trim() || null;
}

/**
 * Reconciles a Scarabeo Invoice with a Proposal.
 */
async function reconcileInvoice(invoiceId, forceProposalId = null) {
    console.log(`[Scarabeo Recon] Starting reconciliation for invoice ${invoiceId}`);

    const invoice = await knex('documents').where({ id: invoiceId }).first();
    if (!invoice) throw new Error('Invoice not found');

    const data = safeParse(invoice.rawJson);
    const shippingMark = getReconciliationMark(data);

    let proposal = null;
    const activeProposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento']);

    if (forceProposalId) {
        proposal = activeProposals.find(p => p.id === forceProposalId);
        if (!proposal) throw new Error('Forced Proposal not found or not active.');
    } else {
        if (!shippingMark) {
            return { success: false, reason: 'No Proposal/Shipping Mark found in Scarabeo Invoice' };
        }

        console.log(`[Scarabeo Recon] Shipping Mark found: ${shippingMark}`);

        // helper to normalize numbers (e.g. 4564/FP -> 4564)
        const normalize = (val) => (val || '').toString().split('/')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
        const normalizedMark = normalize(shippingMark);

        // FASE 1: Match by proposal_number (Normalized)
        proposal = activeProposals.find(p => normalize(p.proposal_number) === normalizedMark);

        // FASE 2: Match by client_ref (Normalized)
        if (!proposal) {
            proposal = activeProposals.find(p => normalize(p.client_ref) === normalizedMark);
        }

        // FASE 3: Soft Match (Client Ref or Proposal Num)
        if (!proposal && normalizedMark.length > 3) {
            for (const p of activeProposals) {
                const normPropNum = normalize(p.proposal_number);
                const normClientRef = normalize(p.client_ref);
                
                if (normPropNum && (normPropNum.includes(normalizedMark) || normalizedMark.includes(normPropNum))) {
                    proposal = p;
                    break;
                }
                if (normClientRef && (normClientRef.includes(normalizedMark) || normalizedMark.includes(normClientRef))) {
                    proposal = p;
                    break;
                }
            }
        }

        // FASE 4: SKU Match
        if (!proposal && data.lines && data.lines.length > 0) {
            const invSkus = data.lines.map(l => (l.sku || '').trim().toUpperCase()).filter(Boolean);
            if (invSkus.length > 0) {
                for (const p of activeProposals) {
                    const pLines = await knex('proposal_lines').where({ proposal_id: p.id }).select('sku');
                    const pSkus = pLines.map(l => (l.sku || '').trim().toUpperCase()).filter(Boolean);

                    let matchesCount = 0;
                    for (const s of invSkus) {
                        if (pSkus.includes(s)) matchesCount++;
                    }
                    if (matchesCount > 0 && matchesCount / invSkus.length >= 0.5) {
                        proposal = p;
                        break;
                    }
                }
            }
        }

        if (!proposal) {
            return { success: false, reason: `Proposal matching '${shippingMark}' or SKUs not found.` };
        }
    }

    console.log(`[Scarabeo Recon] Found Proposal: ${proposal.name} (${proposal.id})`);

    return await knex.transaction(async (trx) => {
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();

        const linesToInsert = (data.lines || []).map((l, idx) => ({
            id: crypto.randomUUID(),
            document_id: invoiceId,
            sku: (l.sku || l.code || '').trim(),
            description: l.description,
            quantity: parseFloat(l.quantity) || 0,
            unit_price: parseFloat(l.unitPrice || l.unit_price) || 0,
            total: parseFloat(l.total) || 0,
            metadata: JSON.stringify({ original_index: idx })
        }));

        if (linesToInsert.length > 0) {
            await trx('document_lines').insert(linesToInsert);
        }

        // Match Lines by SKU with Quantity Distribution
        const proposalLines = await trx('proposal_lines').where({ proposal_id: proposal.id });
        const fulfillments = [];

        const prevFulfillments = await trx('proposal_fulfillments')
            .whereIn('proposal_line_id', proposalLines.map(p => p.id));
        
        const prevFulfMap = {};
        for (const f of prevFulfillments) {
            prevFulfMap[f.proposal_line_id] = (prevFulfMap[f.proposal_line_id] || 0) + parseFloat(f.quantity_fulfilled || 0);
        }

        const pLinesBySku = {};
        for (const p of proposalLines) {
            const sku = (p.sku || '').trim().toUpperCase();
            if (!sku) continue;
            if (!pLinesBySku[sku]) pLinesBySku[sku] = [];
            
            const ordered = parseFloat(p.quantity || 0);
            const fulfilled = prevFulfMap[p.id] || 0;
            const remaining = Math.max(0, ordered - fulfilled);
            
            pLinesBySku[sku].push({ ...p, remaining });
        }

        for (const invLine of linesToInsert) {
            const sku = (invLine.sku || '').trim().toUpperCase();
            if (!sku || !pLinesBySku[sku] || pLinesBySku[sku].length === 0) continue;

            let qtyToDistribute = parseFloat(invLine.quantity || 0);
            const targetLines = pLinesBySku[sku];

            for (let i = 0; i < targetLines.length; i++) {
                if (qtyToDistribute <= 0) break;

                const pLine = targetLines[i];
                let qtyForThisLine = 0;

                if (pLine.remaining > 0) {
                    qtyForThisLine = Math.min(qtyToDistribute, pLine.remaining);
                } else if (i === targetLines.length - 1 && qtyToDistribute > 0) {
                    qtyForThisLine = qtyToDistribute;
                }

                if (qtyForThisLine > 0) {
                    fulfillments.push({
                        id: crypto.randomUUID(),
                        proposal_line_id: pLine.id,
                        doc_line_id: invLine.id,
                        document_id: invoiceId,
                        proposal_id: proposal.id,
                        quantity_fulfilled: qtyForThisLine
                    });
                    
                    qtyToDistribute -= qtyForThisLine;
                    pLine.remaining = Math.max(0, pLine.remaining - qtyForThisLine);
                }
            }
        }

        if (fulfillments.length > 0) {
            await trx('proposal_fulfillments').insert(fulfillments);
        }

        return {
            success: true,
            proposal: proposal.name,
            matched_lines: fulfillments.length,
            total_lines: linesToInsert.length
        };
    });
}

/**
 * Discovers unmatched Scarabeo invoices.
 */
async function discoverMatches() {
    const linkedDocIdsQuery = knex('proposal_fulfillments').select('document_id').distinct();

    const unlinkedInvoices = await knex('documents')
        .where(function () {
            this.where('supplier', 'like', '%SCARABEO%')
                .orWhere('supplier', 'like', '%Scarabeo%');
        })
        .whereIn('docType', ['invoice', 'fatura', 'packing_list'])
        .whereNotIn('id', linkedDocIdsQuery)
        .orderBy('created_at', 'desc');

    const matches = [];
    const activeProposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento']);

    for (const inv of unlinkedInvoices) {
        const data = safeParse(inv.rawJson);
        const mark = getReconciliationMark(data);

        let match = null;
        if (mark && mark.length > 2) {
            match = activeProposals.find(p => 
                p.proposal_number === mark || 
                p.client_ref === mark ||
                (p.proposal_number && p.proposal_number.includes(mark))
            );
        }

        matches.push({
            invoice: {
                id: inv.id,
                date: data.date || inv.date,
                number: data.docNumber || inv.docNumber || 'Sem Nº',
                shipping_mark: mark,
                total: data.totals?.gross || inv.total || 0,
                project: inv.project
            },
            proposal: match ? {
                id: match.id,
                number: match.proposal_number || match.name,
                client_ref: match.client_ref,
                name: match.name
            } : null
        });
    }

    matches.sort((a, b) => {
        if (a.proposal && !b.proposal) return -1;
        if (!a.proposal && b.proposal) return 1;
        return 0;
    });

    return matches;
}

async function getReconciliationReport() {
    const nicolazziService = require('../nicolazziReconciliation/service');
    // For now Scarabeo report is similar to others, we can filter or use universal if it exists
    return await nicolazziService.getReconciliationReport();
}

async function getReconciliationDetails(invoiceId) {
    // Reuse Nicolazzi's detailed view as it's generic enough
    const nicolazziService = require('../nicolazziReconciliation/service');
    return await nicolazziService.getReconciliationDetails(invoiceId);
}

module.exports = {
    reconcileInvoice,
    discoverMatches,
    getReconciliationReport,
    getReconciliationDetails
};
