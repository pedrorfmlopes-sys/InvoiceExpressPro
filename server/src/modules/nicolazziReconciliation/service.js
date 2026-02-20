const knex = require('../../db/knex');
const crypto = require('crypto');

function safeParse(json, fallback = {}) {
    if (!json) return fallback;
    if (typeof json === 'object') return json;
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error('[Nicolazzi Recon] JSON Parse Error:', e.message, 'Data:', json.substring(0, 100));
        return fallback;
    }
}

/**
 * Reconciles a Nicolazzi Invoice with a Proposal based on Shipping Mark.
 * @param {string} invoiceId 
 */
async function reconcileInvoice(invoiceId) {
    console.log(`[Nicolazzi Recon] Starting reconciliation for invoice ${invoiceId}`);

    // 1. Get Invoice Data
    const invoice = await knex('documents').where({ id: invoiceId }).first();
    if (!invoice) throw new Error('Invoice not found');

    const data = safeParse(invoice.rawJson);
    const shippingMark = data.shippingMarks;

    if (!shippingMark) {
        return { success: false, reason: 'No Shipping Mark found in Invoice' };
    }

    console.log(`[Nicolazzi Recon] Shipping Mark found: ${shippingMark}`);

    // 2. Find Proposal
    // Logic: Shipping Mark matches Proposal NUMBER (exact match on clean number)
    const proposal = await knex('custom_proposals')
        .where('proposal_number', shippingMark)
        .first();

    if (!proposal) {
        // Fallback: Try name match just in case? Or strict? 
        // Strict is safer to avoid false positives.
        return { success: false, reason: `Proposal number '${shippingMark}' not found in 'proposal_number' column.` };
    }

    console.log(`[Nicolazzi Recon] Found Proposal: ${proposal.name} (${proposal.id}) [Num: ${proposal.proposal_number}]`);

    // 3. Persist Invoice Lines (Explode JSON to Relational)
    // Transactional safety would be good here
    return await knex.transaction(async (trx) => {

        // A. Clear existing relational data for this invoice
        // Since we didn't use Cascade FKs in the migration, we clean up manually
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();

        // B. Insert Document Lines
        const linesToInsert = (data.lines || []).map((l, idx) => ({
            id: crypto.randomUUID(), // Node 19+ or polyfill. If not available, use knex.raw or import uuid.
            document_id: invoiceId,
            sku: (l.code || '').trim(),
            description: l.description,
            quantity: parseFloat(l.quantity) || 0,
            unit_price: parseFloat(l.unitPrice) || 0,
            total: parseFloat(l.total) || 0,
            metadata: JSON.stringify({ original_index: idx })
        }));

        if (linesToInsert.length > 0) {
            // Batch insert
            await trx('document_lines').insert(linesToInsert);
        }

        // C. Match with Proposal Lines
        const proposalLines = await trx('proposal_lines')
            .where({ proposal_id: proposal.id });

        const fulfillments = [];

        for (const invLine of linesToInsert) {
            // Find ALL proposal lines with this SKU
            // Improved SKU matching: Trim and Case Insensitive
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
            total_lines: linesToInsert.length,
            details: fulfillments.map(f => ({ sku: proposalLines.find(p => p.id === f.proposal_line_id)?.sku, qty: f.quantity_fulfilled }))
        };
    });
}

// Polyfill removed (crypto already required at top)

/**
 * Generates a full reconciliation report with progress status per proposal.
 */
async function getReconciliationReport() {
    // 1. Get all proposals
    const proposals = await knex('custom_proposals')
        .select('id', 'name', 'proposal_number', 'client_ref', 'created_at', 'status');

    const report = [];

    for (const p of proposals) {
        // 2. Calculate Totals (Proposal Lines)
        const pLines = await knex('proposal_lines')
            .where({ proposal_id: p.id })
            .select('quantity');

        const totalItems = pLines.reduce((acc, l) => acc + parseFloat(l.quantity || 0), 0);

        // 3. Calculate Fulfilled (Fulfillments)
        const fulfilled = await knex('proposal_fulfillments')
            .where({ proposal_id: p.id })
            .sum('quantity_fulfilled as qty');

        const totalFulfilled = parseFloat(fulfilled[0]?.qty || 0);

        // 4. Determine Status
        let status = 'pending';
        let progress = 0;

        if (totalItems > 0) {
            progress = (totalFulfilled / totalItems) * 100;
            // Cap at 100% just in case of over-delivery
            if (progress > 100) progress = 100;

            if (progress >= 100) status = 'completed';
            else if (progress > 0) status = 'partial';
        }

        report.push({
            id: p.id,
            proposal_number: p.proposal_number || p.name,
            client_ref: p.client_ref,
            total_items: totalItems,
            fulfilled_items: totalFulfilled,
            progress: parseFloat(progress.toFixed(1)),
            status: status,
            created_at: p.created_at
        });
    }

    return report;
}


/**
 * Get detailed line-by-line reconciliation status for a specific invoice.
 * @param {string} invoiceId 
 */
async function getReconciliationDetails(invoiceId) {
    // 1. Fetch Invoice
    const invoice = await knex('documents').where({ id: invoiceId }).first();
    if (!invoice) throw new Error('Invoice not found');
    const invoiceData = safeParse(invoice.rawJson);

    // 2. Fetch Linked Proposal (via Fulfillments or direct lookup if we stored relationship)
    // We rely on fulfillments to know for sure, OR the shipping mark.
    // Let's check if there are fulfillments first.
    const fulfillments = await knex('proposal_fulfillments')
        .where({ document_id: invoiceId });

    let proposalId = fulfillments.length > 0 ? fulfillments[0].proposal_id : null;
    let proposal = null;

    // If no fulfillments yet, try to guess via Shipping Mark to show "Potential Match"
    if (!proposalId && invoiceData.shippingMarks) {
        const potential = await knex('custom_proposals').where('proposal_number', invoiceData.shippingMarks).first();
        if (potential) {
            proposalId = potential.id;
            proposal = potential;
        }
    } else if (proposalId) {
        proposal = await knex('custom_proposals').where({ id: proposalId }).first();
    }

    if (!proposal) {
        return {
            linked: false,
            invoice: {
                number: invoiceData.docNumber,
                date: invoiceData.date,
                total: invoiceData.totals?.gross
            },
            lines: []
        };
    }

    // 3. Fetch All Relevant Lines
    const invoiceLines = await knex('document_lines').where({ document_id: invoiceId }).orderBy('id'); // Using ID as we might not have index
    const proposalLines = await knex('proposal_lines').where({ proposal_id: proposalId });

    // Map Proposal Lines for easy lookup
    const propMap = new Map(proposalLines.map(p => [p.id, p]));
    const propSkuMap = new Map(proposalLines.map(p => [p.sku, p])); // Fallback for pure SKU match

    // 4. Build Comparison View
    // We iterate INVOICE lines (what we are billing)
    // and try to attach proposal info.

    // If we have real fulfillments, use them.
    const fulfillMap = new Map(fulfillments.map(f => [f.doc_line_id, f]));

    const detailedLines = invoiceLines.map(invLine => {
        const fulfillment = fulfillMap.get(invLine.id);
        let status = 'unmatched';
        let propLine = null;

        if (fulfillment) {
            status = 'matched';
            propLine = propMap.get(fulfillment.proposal_line_id);
        } else {
            // Try Soft Match by SKU if not formally reconciled yet
            propLine = propSkuMap.get(invLine.sku);
            if (propLine) status = 'potential';
        }

        return {
            invoice_line: {
                sku: invLine.sku,
                desc: invLine.description,
                qty: invLine.quantity,
                unit_price: invLine.unit_price,
                total: invLine.total
            },
            proposal_line: propLine ? {
                sku: propLine.sku,
                original_qty: propLine.quantity,
                // We'd need to calc "remaining" but that requires checking ALL invoices. 
                // For now, just showing original is helpful.
            } : null,
            status: status,
            match_diff: propLine ? (invLine.quantity - propLine.quantity) : 0 // + means billed MORE than ordered (if 1:1)
        };
    });

    return {
        linked: true,
        invoice: {
            id: invoice.id,
            number: invoiceData.docNumber,
            date: invoiceData.date,
            shipping_mark: invoiceData.shippingMarks
        },
        proposal: {
            id: proposal.id,
            number: proposal.proposal_number,
            name: proposal.name,
            client_ref: proposal.client_ref
        },
        lines: detailedLines,
        stats: {
            total_inv: detailedLines.length,
            matched: detailedLines.filter(l => l.status === 'matched').length,
            potential: detailedLines.filter(l => l.status === 'potential').length
        }
    };
}


/**
 * Get detailed fulfillment status for a specific proposal.
 * Shows each proposal line and where/how much was fulfilled.
 * @param {string} proposalId 
 */
async function getProposalFulfillmentDetails(proposalId) {
    try {
        // 1. Get Proposal Info
        let proposal = await knex('custom_proposals').where({ id: proposalId }).first();
        if (!proposal) throw new Error('Proposal not found in database');

        // AUTO-PATCH: If proposal_number is missing, try to recover it from original document
        if (!proposal.proposal_number && proposal.original_doc_id) {
            const sourceDoc = await knex('documents').where({ id: proposal.original_doc_id }).first();
            if (sourceDoc) {
                const sdData = safeParse(sourceDoc.rawJson);
                const recoveredNum = sdData.docNumber || sourceDoc.docNumber || sdData.shippingMarks;
                if (recoveredNum) {
                    await knex('custom_proposals').where({ id: proposalId }).update({ proposal_number: recoveredNum });
                    proposal.proposal_number = recoveredNum;
                }
            }
        }

        // 2. Get Proposal Lines
        const lines = await knex('proposal_lines').where({ proposal_id: proposalId }).orderBy('id');

        // 3. Get All Fulfillments for this Proposal
        const fulfillments = await knex('proposal_fulfillments as pf')
            .join('documents as d', 'pf.document_id', 'd.id')
            .where('pf.proposal_id', proposalId)
            .select(
                'pf.proposal_line_id',
                'pf.quantity_fulfilled',
                'pf.doc_line_id',
                'd.id as doc_id',
                'd.project',
                'd.rawJson',
                'd.docNumber',
                'd.supplier',
                'd.date',
                'd.total',
                'd.docType'
            );

        // Pre-build Documents Map to avoid missing documents with stale line links
        const docsMap = new Map();
        for (const f of fulfillments) {
            if (!docsMap.has(f.doc_id)) {
                const docData = safeParse(f.rawJson);
                docsMap.set(f.doc_id, {
                    id: f.doc_id,
                    project: f.project,
                    type: 'invoice',
                    docType: f.docType || 'fatura',
                    supplier: f.supplier || 'NICOLAZZI',
                    number: docData?.docNumber || f.docNumber || 'Fatura',
                    date: docData?.date || f.date,
                    total: docData?.totals?.gross || f.total,
                    isLinked: true
                });
            }
        }

        // Discovery Logic: Find potential invoices that match this proposal number
        let potentialMatches = [];
        if (proposal.proposal_number) {
            const token = proposal.proposal_number.trim();
            if (token.length > 3) {
                const unlinkedInvoicesQuery = knex('documents')
                    .where(function () {
                        this.where('supplier', 'like', '%NICOLAZZI%')
                            .orWhere('supplier', 'like', '%Nicolazzi%');
                    })
                    .where('rawJson', 'like', `%${token}%`);

                const unlinkedInvoices = (await unlinkedInvoicesQuery) || [];
                potentialMatches = unlinkedInvoices.map(inv => {
                    const data = safeParse(inv.rawJson);
                    const matchFound = (data.docNumber === token) ||
                        (data.shippingMarks === token) ||
                        (inv.docNumber === token);

                    if (!matchFound) return null;

                    // Critical: Ignore the proforma (source doc)
                    if (inv.id === proposal.original_doc_id) return null;

                    // NEW: Ignore if already linked to keep sidebar clean
                    if (docsMap.has(inv.id)) return null;

                    return {
                        id: inv.id,
                        project: inv.project,
                        type: 'invoice',
                        number: data.docNumber || inv.docNumber || 'Doc s/ nº',
                        date: data.date || inv.date,
                        total: parseFloat(data.totals?.gross || inv.total || 0),
                        status: 'detected',
                        supplier: inv.supplier || 'NICOLAZZI',
                        docType: inv.docType || 'fatura'
                    };
                }).filter(Boolean);
            }
        }

        // 4. Financial Calculations & Document Maps
        let totalOrderedNet = 0;
        let totalFulfilledNet = 0;
        // docsMap already initialized above

        // Source Document (Proforma?)
        if (proposal.original_doc_id) {
            const sourceDoc = await knex('documents').where({ id: proposal.original_doc_id }).first();
            if (sourceDoc) {
                const sdData = safeParse(sourceDoc.rawJson);
                docsMap.set(proposal.original_doc_id, {
                    id: proposal.original_doc_id,
                    project: sourceDoc.project,
                    type: 'source',
                    docType: sourceDoc.docType || 'proforma',
                    supplier: sourceDoc.supplier,
                    number: sdData.docNumber || sourceDoc.docNumber || 'Source Doc',
                    date: sdData.date || sourceDoc.date,
                    total: sdData.totals?.gross || sourceDoc.total
                });
            }
        }

        // 5. Aggregate Fulfillments per Line
        const linesWithFulfillment = lines.map(line => {
            const lineFulfillments = fulfillments.filter(f => f.proposal_line_id === line.id);
            const totalFulfilledQty = lineFulfillments.reduce((acc, f) => acc + parseFloat(f.quantity_fulfilled || 0), 0);
            const originalQty = parseFloat(line.quantity || 0);

            const unitPrice = parseFloat(line.unit_price_commercial || line.unit_price || 0);
            const discount = parseFloat(line.discount_commercial_percent || 0);
            const netPrice = unitPrice * (1 - (discount / 100));

            totalOrderedNet += (originalQty * netPrice);
            totalFulfilledNet += (totalFulfilledQty * netPrice);

            const history = lineFulfillments.map(f => {
                const docData = safeParse(f.rawJson);
                // (docsMap already populated above)
                return { doc_id: f.doc_id, doc_number: docData?.docNumber || 'Doc', date: docData?.date, qty: parseFloat(f.quantity_fulfilled) };
            });

            return {
                id: line.id,
                sku: line.sku,
                description: line.description,
                uom: line.uom || 'UN',
                qty_ordered: originalQty,
                qty_fulfilled: totalFulfilledQty,
                qty_remaining: Math.max(0, originalQty - totalFulfilledQty),
                unit_price: unitPrice,
                net_total_ordered: originalQty * netPrice,
                net_total_fulfilled: totalFulfilledQty * netPrice,
                net_total_pending: Math.max(0, originalQty - totalFulfilledQty) * netPrice,
                lead_time_weeks: line.lead_time_weeks || proposal.general_lead_time_weeks || 0,
                predicted_ship_date: line.predicted_ship_date,
                production_category: line.production_category,
                status: totalFulfilledQty >= originalQty ? 'completed' : (totalFulfilledQty > 0 ? 'partial' : 'pending'),
                history: history
            };
        });

        const totalOrderedCount = linesWithFulfillment.reduce((acc, l) => acc + l.qty_ordered, 0);
        const totalFulfilledCount = linesWithFulfillment.reduce((acc, l) => acc + l.qty_fulfilled, 0);
        const progress = totalOrderedCount > 0 ? (totalFulfilledCount / totalOrderedCount) * 100 : 0;
        const vatRate = 0.22;

        // Calculate Logistics Metrics
        let avgLeadTimeDays = 0;
        let deliveries = 0;
        const baseDate = proposal.order_confirmation_date ? new Date(proposal.order_confirmation_date) : new Date(proposal.created_at);

        const docs = Array.from(docsMap.values());
        docs.forEach(d => {
            if (d.type === 'invoice' && d.date) {
                const invDate = new Date(d.date);
                const diffTime = Math.abs(invDate - baseDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                d.lead_time_days = diffDays;
                avgLeadTimeDays += diffDays;
                deliveries++;
            }
        });

        const metrics = {
            avg_days_to_delivery: deliveries > 0 ? Math.round(avgLeadTimeDays / deliveries) : null,
            reliability_score: progress > 0 ? 100 : 0, // Simplified for now
            total_deliveries: deliveries
        };

        return {
            proposal: {
                id: proposal.id,
                number: proposal.proposal_number || proposal.name,
                client_ref: proposal.client_ref,
                created_at: proposal.created_at,
                general_lead_time_weeks: proposal.general_lead_time_weeks,
                order_confirmation_date: proposal.order_confirmation_date
            },
            stats: {
                total_ordered: totalOrderedCount,
                total_fulfilled: totalFulfilledCount,
                progress: parseFloat(progress.toFixed(1)),
                status: progress >= 100 ? 'completed' : 'pending'
            },
            financial: {
                ordered: { net: totalOrderedNet, gross: totalOrderedNet * (1 + vatRate) },
                fulfilled: { net: totalFulfilledNet, gross: totalFulfilledNet * (1 + vatRate) },
                pending: { net: Math.max(0, totalOrderedNet - totalFulfilledNet), gross: Math.max(0, (totalOrderedNet - totalFulfilledNet) * (1 + vatRate)) }
            },
            metrics: metrics,
            documents: docs,
            potentialMatches: potentialMatches,
            lines: linesWithFulfillment
        };
    } catch (error) {
        console.error('[Nicolazzi Prop Fulfillment] Critical Error:', error);
        // Fallback response so frontend doesn't 500 but shows error
        return {
            error: true,
            message: error.message,
            stack: error.stack,
            proposal: { number: 'Error' },
            stats: { progress: 0 },
            lines: [],
            documents: []
        };
    }
}

module.exports = {
    reconcileInvoice,
    getReconciliationReport,
    getReconciliationDetails,
    getProposalFulfillmentDetails
};
