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

function getReconciliationMark(data) {
    if (!data) return null;
    const nicoMark = data.shippingMarks;
    const ritMark = data.docRefs?.customerOrder?.number;
    return (nicoMark || ritMark || '').trim() || null;
}

/**
 * Reconciles a Nicolazzi Invoice with a Proposal based on Shipping Mark.
 * @param {string} invoiceId 
 */
async function reconcileInvoice(invoiceId, forceProposalId = null) {
    console.log(`[Nicolazzi Recon] Starting reconciliation for invoice ${invoiceId}`);

    // 1. Get Invoice Data
    const invoice = await knex('documents').where({ id: invoiceId }).first();
    if (!invoice) throw new Error('Invoice not found');

    const data = safeParse(invoice.rawJson);
    const shippingMark = getReconciliationMark(data);

    let proposal = null;

    if (forceProposalId) {
        proposal = await knex('custom_proposals').where({ id: forceProposalId }).first();
        if (!proposal) throw new Error('Forced Proposal not found.');
    } else {
        if (!shippingMark) {
            return { success: false, reason: 'No Proposal/Shipping Mark found in Invoice' };
        }

        console.log(`[Nicolazzi Recon] Shipping Mark found: ${shippingMark}`);

        // 2. Find Proposal
        proposal = await knex('custom_proposals')
            .where('proposal_number', shippingMark)
            .whereIn('status', ['accepted', 'em_fornecimento'])
            .first();

        if (!proposal) {
            return { success: false, reason: `Proposal number '${shippingMark}' not found in 'proposal_number' column.` };
        }
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
    // Only load active proposals for reconciliation report to avoid noise
    const proposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref', 'created_at', 'status');

    const report = [];

    for (const p of proposals) {
        // 2. Calculate Totals (Proposal Lines)
        const pLines = await knex('proposal_lines')
            .where({ proposal_id: p.id })
            .select('quantity', 'sku', 'description');

        const totalItems = pLines.reduce((acc, l) => acc + parseFloat(l.quantity || 0), 0);

        // Also extract a searchable string of SKUs and descriptions
        const searchableItems = pLines.map(l => `${l.sku} ${l.description}`).join(' ').toLowerCase();

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
            created_at: p.created_at,
            search_blob: `${p.proposal_number || ''} ${p.client_ref || ''} ${searchableItems}`.toLowerCase()
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
    const mark = getReconciliationMark(invoiceData);
    if (!proposalId && mark) {
        const potential = await knex('custom_proposals')
            .where('proposal_number', mark)
            .whereIn('status', ['accepted', 'em_fornecimento'])
            .first();
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
            lines: [],
            stats: {
                total_inv: 0,
                matched: 0,
                potential: 0
            }
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

        // 2. Get Proposal Lines + global discount from metadata
        const lines = await knex('proposal_lines').where({ proposal_id: proposalId }).orderBy('sort_order');
        let proposalMeta = {};
        try { proposalMeta = JSON.parse(proposal.metadata || '{}'); } catch (_) { }
        // Global discount applied on top of line-level commercial discount (e.g. an extra 5% off total)
        const globalDiscountPercent = parseFloat(proposalMeta.global_discount || 0);
        const globalDiscountMultiplier = 1 - (globalDiscountPercent / 100);


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
        let totalCostNet = 0;
        const linesWithFulfillment = lines.map(line => {
            const lineFulfillments = fulfillments.filter(f => f.proposal_line_id === line.id);
            const totalFulfilledQty = lineFulfillments.reduce((acc, f) => acc + parseFloat(f.quantity_fulfilled || 0), 0);
            const originalQty = parseFloat(line.quantity || 0);

            // ── CUSTO (Proforma price → what we pay the factory) ─────────────────
            // unit_price_factory = proforma unit price (list price from Nicolazzi)
            // discount_factory   = factory discount chain (e.g. "50+5")
            const unitPriceFactory = parseFloat(line.unit_price_factory || 0);
            const discountFactoryStr = line.discount_factory || '';
            let factoryMultiplier = 1;
            discountFactoryStr.split('+').forEach(d => {
                const perc = parseFloat(d);
                if (!isNaN(perc)) factoryMultiplier *= (1 - perc / 100);
            });
            const hasCostData = unitPriceFactory > 0 && discountFactoryStr.length > 0;
            const netCostPrice = hasCostData ? unitPriceFactory * factoryMultiplier : 0;

            // ── VENDA (Proposal price → what the client pays us) ─────────────────
            // unit_price_commercial = commercial unit price (same list in this case,
            //   but may differ if the proposal editor sets a different sale price)
            // discount_commercial_percent = line-level commercial discount
            // globalDiscountMultiplier    = extra proposal-level discount
            const unitPriceComm = parseFloat(line.unit_price_commercial || 0);
            const discountComm = parseFloat(line.discount_commercial_percent || 0);
            const netSalePrice = unitPriceComm * (1 - discountComm / 100) * globalDiscountMultiplier;

            // ── MARGEM ───────────────────────────────────────────────────────────
            const marginPerUnit = hasCostData ? netSalePrice - netCostPrice : 0;
            const marginPercent = hasCostData && netSalePrice > 0 ? (marginPerUnit / netSalePrice) * 100 : 0;

            totalOrderedNet += (originalQty * netSalePrice);
            totalFulfilledNet += (totalFulfilledQty * netSalePrice);
            if (hasCostData) totalCostNet += (originalQty * netCostPrice);

            const history = lineFulfillments.map(f => {
                const docData = safeParse(f.rawJson);
                return { doc_id: f.doc_id, doc_number: docData?.docNumber || 'Doc', date: docData?.date, qty: parseFloat(f.quantity_fulfilled) };
            });

            const effectiveLeadWeeks = line.lead_time_weeks || proposal.general_lead_time_weeks || 0;

            // Calculate predicted_ship_date dynamically if not stored
            let predictedDate = line.predicted_ship_date;
            if (!predictedDate && effectiveLeadWeeks > 0) {
                const baseDate = proposal.order_confirmation_date
                    ? new Date(proposal.order_confirmation_date)
                    : new Date();
                baseDate.setDate(baseDate.getDate() + (effectiveLeadWeeks * 7));
                predictedDate = baseDate.getTime();
            }

            return {
                id: line.id,
                sku: line.sku,
                description: line.description,
                uom: line.uom || 'UN',
                qty_ordered: originalQty,
                qty_fulfilled: totalFulfilledQty,
                qty_remaining: Math.max(0, originalQty - totalFulfilledQty),
                unit_price: netSalePrice,
                unit_price_factory: netCostPrice,
                unit_price_commercial: netSalePrice,
                margin_per_unit: marginPerUnit,
                margin_percent: parseFloat(marginPercent.toFixed(1)),
                net_total_ordered: originalQty * netSalePrice,
                net_total_cost: originalQty * netCostPrice,
                net_margin: originalQty * marginPerUnit,
                net_total_fulfilled: totalFulfilledQty * netSalePrice,
                net_total_pending: Math.max(0, originalQty - totalFulfilledQty) * netSalePrice,
                lead_time_weeks: effectiveLeadWeeks,
                predicted_ship_date: predictedDate,
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
                pending: { net: Math.max(0, totalOrderedNet - totalFulfilledNet), gross: Math.max(0, (totalOrderedNet - totalFulfilledNet) * (1 + vatRate)) },
                cost: { net: totalCostNet, gross: totalCostNet * (1 + vatRate) },
                margin: {
                    net: totalOrderedNet - totalCostNet,
                    gross: (totalOrderedNet - totalCostNet) * (1 + vatRate),
                    percent: totalOrderedNet > 0 ? parseFloat(((totalOrderedNet - totalCostNet) / totalOrderedNet * 100).toFixed(1)) : 0
                }
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

/**
 * Unlinks an invoice from its proposal by deleting its fulfillment records and document lines.
 */
async function unlinkInvoice(invoiceId) {
    return await knex.transaction(async (trx) => {
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();
        return { success: true };
    });
}

/**
 * Discovers unmatched invoices and suggests potential proposal matches.
 */
async function discoverMatches() {
    // 1. Get all invoices that are NOT in proposal_fulfillments
    const linkedDocIdsQuery = knex('proposal_fulfillments').select('document_id').distinct();

    const unlinkedInvoices = await knex('documents')
        .where(function () {
            this.where('supplier', 'like', '%NICOLAZZI%')
                .orWhere('supplier', 'like', '%Nicolazzi%');
        })
        .whereIn('docType', ['invoice', 'fatura', 'packing_list'])
        .whereNotIn('id', linkedDocIdsQuery)
        .orderBy('created_at', 'desc');

    const matches = [];

    // 2. Try to match each unlinked invoice to an active proposal
    for (const inv of unlinkedInvoices) {
        const data = safeParse(inv.rawJson);
        const marks = getReconciliationMark(data) || (inv.docNumber || '').trim();

        let match = null;

        if (marks && marks.length > 2) {
            match = await knex('custom_proposals')
                .where('proposal_number', marks)
                .whereIn('status', ['accepted', 'em_fornecimento'])
                .first();
        }

        matches.push({
            invoice: {
                id: inv.id,
                date: data.date || inv.date,
                number: data.docNumber || inv.docNumber || 'Sem Nº',
                shipping_mark: marks,
                total: data.totals?.gross || inv.total || 0,
                project: inv.project
            },
            proposal: match ? {
                id: match.id,
                number: match.proposal_number,
                client_ref: match.client_ref,
                name: match.name
            } : null
        });
    }

    // Sort: Matches first
    matches.sort((a, b) => {
        if (a.proposal && !b.proposal) return -1;
        if (!a.proposal && b.proposal) return 1;
        return 0;
    });

    return matches;
}

/**
 * Exports the detailed line statuses of multiple proposals to a consolidated Excel file.
 */
async function exportReconciliationExcel(proposalIds) {
    const XLSX = require('xlsx');

    const workbook = XLSX.utils.book_new();
    const rows = [];

    // Header row
    rows.push([
        'Nº Proposta',
        'Ref Cliente',
        'SKU',
        'Descrição',
        'Data Pedido',
        'Prazo Entrega Previsto',
        'Qtd Pedida',
        'Qtd Entregue',
        'Qtd Pendente',
        'Estado (Linha)',
        'Docs (Faturas)'
    ]);

    for (const pid of proposalIds) {
        // We reuse the existing details logic which already calculates everything.
        const details = await getProposalFulfillmentDetails(pid);
        if (!details || details.error || !details.lines) continue;

        const propNum = details.proposal?.number || 'Desconhecida';
        const clientRef = details.proposal?.client_ref || '';
        const defaultDate = details.proposal?.date || details.proposal?.order_confirmation_date;
        const fmtDate = defaultDate ? new Date(defaultDate).toLocaleDateString('pt-PT') : '';

        for (const line of details.lines) {
            const shipDate = line.predicted_ship_date
                ? new Date(line.predicted_ship_date).toLocaleDateString('pt-PT')
                : '';

            let statusPt = 'Pendente';
            if (line.status === 'completed') statusPt = 'Concluído';
            if (line.status === 'partial') statusPt = 'Parcial';

            const docsLinked = line.history ? line.history.map(h => h.doc_number).join(', ') : '';

            rows.push([
                propNum,
                clientRef,
                line.sku,
                line.description,
                fmtDate,
                shipDate,
                line.qty_ordered,
                line.qty_fulfilled,
                line.qty_remaining,
                statusPt,
                docsLinked
            ]);
        }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    // Auto-size columns roughly
    const colWidths = [
        { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 12 },
        { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 25 }
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Status_Encomendas');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
}


async function getAnalytics() {
    // We get all lines for all active nicolazzi proposals to calculate stats
    const proposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref');

    let totalOrderedNet = 0;
    let totalCostNet = 0;
    let lateItemsCount = 0;
    let totalItemsPending = 0;

    // For lead time tracking
    let totalLeadTimeDays = 0;
    let deliveredDocsCount = 0;

    const today = new Date();

    for (const p of proposals) {
        const details = await getProposalFulfillmentDetails(p.id);
        if (!details || details.error) continue;

        totalOrderedNet += parseFloat(details.financial?.ordered?.net || 0);
        totalCostNet += parseFloat(details.financial?.cost?.net || 0);

        for (const line of details.lines) {
            if (line.qty_remaining > 0) {
                totalItemsPending += line.qty_remaining;
                if (line.predicted_ship_date) {
                    const pDate = new Date(line.predicted_ship_date);
                    if (pDate < today) {
                        lateItemsCount += line.qty_remaining; // Count as late
                    }
                }
            }
        }

        // Aggregate average lead time from documents
        for (const doc of details.documents) {
            if (doc.type === 'invoice' && doc.lead_time_days > 0) {
                totalLeadTimeDays += doc.lead_time_days;
                deliveredDocsCount++;
            }
        }
    }

    const marginNet = totalOrderedNet - totalCostNet;
    const marginPercent = totalOrderedNet > 0 ? (marginNet / totalOrderedNet) * 100 : 0;
    const avgLeadTime = deliveredDocsCount > 0 ? Math.round(totalLeadTimeDays / deliveredDocsCount) : 0;

    return {
        financial: {
            revenue: totalOrderedNet,
            cost: totalCostNet,
            margin: marginNet,
            marginPercent: parseFloat(marginPercent.toFixed(1))
        },
        logistics: {
            avgLeadTimeDays: avgLeadTime,
            lateItemsCurrent: lateItemsCount,
            totalItemsPending: totalItemsPending,
            latePercentage: totalItemsPending > 0 ? ((lateItemsCount / totalItemsPending) * 100).toFixed(1) : 0
        }
    };
}

async function exportLateItemsExcel() {
    const XLSX = require('xlsx');

    // Get all lines for all active nicolazzi proposals
    const proposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref');

    const rows = [];
    const today = new Date();

    // Header 
    rows.push([
        'Nº Proposta',
        'Ref Cliente',
        'Modelo/SKU',
        'Descrição',
        'Data Pedido',
        'Lim. Previsto',
        'Atraso (Dias)',
        'Qtd Encomendada',
        'Qtd Pendente'
    ]);

    for (const p of proposals) {
        const details = await getProposalFulfillmentDetails(p.id);
        if (!details || details.error) continue;

        const propNum = details.proposal?.number || p.proposal_number || p.name;
        const clientRef = details.proposal?.client_ref || p.client_ref || '';
        const orderDate = details.proposal?.order_confirmation_date
            ? new Date(details.proposal.order_confirmation_date).toLocaleDateString('pt-PT')
            : '';

        for (const line of details.lines) {
            if (line.qty_remaining > 0 && line.predicted_ship_date) {
                const pDate = new Date(line.predicted_ship_date);
                if (pDate < today) {
                    const diffTime = Math.abs(today - pDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    rows.push([
                        propNum,
                        clientRef,
                        line.sku,
                        line.description,
                        orderDate,
                        pDate.toLocaleDateString('pt-PT'),
                        diffDays,
                        line.qty_ordered,
                        line.qty_remaining
                    ]);
                }
            }
        }
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    const colWidths = [
        { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 45 },
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 16 }
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Artigos_Em_Atraso');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
}


module.exports = {
    reconcileInvoice,
    getReconciliationReport,
    getReconciliationDetails,
    getProposalFulfillmentDetails,
    unlinkInvoice,
    discoverMatches,
    exportReconciliationExcel,
    getAnalytics,
    exportLateItemsExcel
};
