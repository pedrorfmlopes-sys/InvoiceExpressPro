const knex = require('../../db/knex');
const crypto = require('crypto');

function safeParse(json, fallback = {}) {
    if (!json) return fallback;
    if (typeof json === 'object') return json;
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error('[Ritmonio Recon] JSON Parse Error:', e.message);
        return fallback;
    }
}

function getReconciliationMark(data) {
    if (!data) return null;
    // Ritmonio specifically extracts the 'Veronic (Atk)' kind of mark into docRefs.customerOrder.number
    const ritMark = data.docRefs?.customerOrder?.number;
    return (ritMark || '').trim() || null;
}

/**
 * PHASE 1: EXACT MATCH
 * Reconciles a Ritmonio Invoice with a Proposal based on Client Project Name metadata exact match.
 */
async function reconcileInvoice(invoiceId, forceProposalId = null) {
    console.log(`[Ritmonio Recon] Starting reconciliation for invoice ${invoiceId}`);

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
            return { success: false, reason: 'No Proposal/Shipping Mark found in Ritmonio Invoice' };
        }

        console.log(`[Ritmonio Recon] Shipping Mark found: ${shippingMark}`);

        // FASE 1: Buscar na metadata o client_project_name exato
        for (const p of activeProposals) {
            try {
                const meta = JSON.parse(p.metadata || '{}');
                if (meta.client_project_name && meta.client_project_name.trim().toLowerCase() === shippingMark.toLowerCase()) {
                    proposal = p;
                    break;
                }
            } catch (e) { }
        }

        // FASE 2: Soft Match
        if (!proposal && shippingMark.length > 3) {
            const cleanMark = shippingMark.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const p of activeProposals) {
                try {
                    const meta = JSON.parse(p.metadata || '{}');
                    if (meta.client_project_name) {
                        const cleanProj = meta.client_project_name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (cleanProj.length > 3 && (cleanProj.includes(cleanMark) || cleanMark.includes(cleanProj))) {
                            proposal = p;
                            break;
                        }
                    }
                } catch (e) { }
            }
        }

        // FASE 3: SKU Match
        if (!proposal && data.lines && data.lines.length > 0) {
            const invSkus = data.lines.map(l => (l.code || '').trim().toUpperCase()).filter(Boolean);
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
            return { success: false, reason: `Proposal with client project name '${shippingMark}' or matching SKUs not found.` };
        }
    }

    console.log(`[Ritmonio Recon] Found Proposal: ${proposal.name} (${proposal.id})`);

    return await knex.transaction(async (trx) => {
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();

        const linesToInsert = (data.lines || []).map((l, idx) => ({
            id: crypto.randomUUID(),
            document_id: invoiceId,
            sku: (l.code || '').trim(),
            description: l.description,
            quantity: parseFloat(l.quantity) || 0,
            unit_price: parseFloat(l.unitPrice) || 0,
            total: parseFloat(l.total) || 0,
            metadata: JSON.stringify({ original_index: idx })
        }));

        if (linesToInsert.length > 0) {
            await trx('document_lines').insert(linesToInsert);
        }

        const proposalLines = await trx('proposal_lines').where({ proposal_id: proposal.id });
        const fulfillments = [];

        for (const invLine of linesToInsert) {
            // PHASE 3: Match Lines by SKU
            const pLine = proposalLines.find(p => {
                const pSku = (p.sku || '').trim().toUpperCase();
                const iSku = (invLine.sku || '').trim().toUpperCase();
                return pSku === iSku && pSku !== '';
            });

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
 * Discovers unmatched invoices and suggests potential proposal matches.
 */
async function discoverMatches() {
    const linkedDocIdsQuery = knex('proposal_fulfillments').select('document_id').distinct();

    const unlinkedInvoices = await knex('documents')
        .where(function () {
            this.where('supplier', 'like', '%RITMONIO%')
                .orWhere('supplier', 'like', '%Ritmonio%')
                .orWhere('supplier', 'like', '%Rubinetteri%');
        })
        .whereIn('docType', ['invoice', 'fatura', 'packing_list'])
        .whereNotIn('id', linkedDocIdsQuery)
        .orderBy('created_at', 'desc');

    const matches = [];
    const activeProposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento']);

    // Optimization: Pre-fetch all lines for these proposals to avoid N+1 queries
    const proposalIds = activeProposals.map(p => p.id);
    const allPLines = await knex('proposal_lines')
        .whereIn('proposal_id', proposalIds)
        .select('proposal_id', 'sku');

    // Group lines by proposal
    const pLinesMap = new Map();
    for (const pl of allPLines) {
        if (!pLinesMap.has(pl.proposal_id)) pLinesMap.set(pl.proposal_id, []);
        pLinesMap.get(pl.proposal_id).push((pl.sku || '').trim().toUpperCase());
    }

    for (const inv of unlinkedInvoices) {
        const data = safeParse(inv.rawJson);
        const mark = getReconciliationMark(data);

        let match = null;
        let matchPhase = '';

        if (mark && mark.length > 2) {
            // Fase 1 Match em discover
            for (const p of activeProposals) {
                try {
                    const meta = JSON.parse(p.metadata || '{}');
                    if (meta.client_project_name && meta.client_project_name.trim().toLowerCase() === mark.toLowerCase()) {
                        match = p;
                        matchPhase = 'Fase 1 (Exato)';
                        break;
                    }
                } catch (e) { }
            }

            // Fase 2 Soft Match em discover
            if (!match) {
                const cleanMark = mark.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const p of activeProposals) {
                    try {
                        const meta = JSON.parse(p.metadata || '{}');
                        if (meta.client_project_name) {
                            const cleanProj = meta.client_project_name.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (cleanProj.length > 3 && (cleanProj.includes(cleanMark) || cleanMark.includes(cleanProj))) {
                                match = p;
                                matchPhase = 'Fase 2 (Aproximado)';
                                break;
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        // Fase 3 SKU Match
        if (!match && data.lines && data.lines.length > 0) {
            const invSkus = data.lines.map(l => (l.code || '').trim().toUpperCase()).filter(Boolean);
            if (invSkus.length > 0) {
                for (const p of activeProposals) {
                    const pSkus = pLinesMap.get(p.id) || [];
                    if (pSkus.length === 0) continue;

                    let matchesCount = 0;
                    for (const s of invSkus) {
                        if (pSkus.includes(s)) matchesCount++;
                    }
                    if (matchesCount > 0 && matchesCount / invSkus.length >= 0.5) {
                        match = p;
                        matchPhase = `Fase 3 (SKUs - ${matchesCount}/${invSkus.length})`;
                        break;
                    }
                }
            }
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
                name: match.name,
                matchPhase: matchPhase
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
    const proposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref', 'created_at');

    const report = [];

    for (const p of proposals) {
        const pLines = await knex('proposal_lines').where({ proposal_id: p.id });
        const fulfillments = await knex('proposal_fulfillments').where({ proposal_id: p.id });

        const totalQty = pLines.reduce((acc, l) => acc + parseFloat(l.quantity || 0), 0);
        const fulfilledQty = fulfillments.reduce((acc, f) => acc + parseFloat(f.quantity_fulfilled || 0), 0);

        report.push({
            id: p.id,
            number: p.proposal_number || p.name,
            name: p.name,
            client_ref: p.client_ref,
            total_items: totalQty,
            fulfilled_items: fulfilledQty,
            progress: totalQty > 0 ? (fulfilledQty / totalQty) * 100 : 0
        });
    }

    return report;
}

async function getReconciliationDetails(invoiceId) {
    const fulfillments = await knex('proposal_fulfillments as pf')
        .join('custom_proposals as cp', 'pf.proposal_id', 'cp.id')
        .where('pf.document_id', invoiceId)
        .select('pf.*', 'cp.name as proposal_name', 'cp.proposal_number');

    if (fulfillments.length === 0) {
        return { Linked: false, lines: [] };
    }

    const docLines = await knex('document_lines').where({ document_id: invoiceId });

    return {
        linked: true,
        proposal: {
            id: fulfillments[0].proposal_id,
            name: fulfillments[0].proposal_name,
            number: fulfillments[0].proposal_number
        },
        lines: docLines.map(dl => {
            const f = fulfillments.find(f => f.doc_line_id === dl.id);
            return {
                sku: dl.sku,
                description: dl.description,
                quantity: dl.quantity,
                fulfilled: f ? f.quantity_fulfilled : 0,
                status: f ? 'linked' : 'unlinked'
            };
        })
    };
}

async function getAnalytics(proposalIds = null) {
    // We import from the nicolazzi service as it's the current 'de facto' core for analytics
    const nicolazziService = require('../nicolazziReconciliation/service');
    return await nicolazziService.getAnalytics(proposalIds);
}

async function resetAllMatchings() {
    const nicolazziService = require('../nicolazziReconciliation/service');
    return await nicolazziService.resetAllMatchings('RITMONIO');
}

module.exports = {
    reconcileInvoice,
    discoverMatches,
    getReconciliationReport,
    getReconciliationDetails,
    getAnalytics,
    resetAllMatchings
};
