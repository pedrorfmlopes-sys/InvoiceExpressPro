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
    return await reconcileInvoiceInternal(invoiceId, forceProposalId);
}

// Polyfill removed (crypto already required at top)

/**
 * Generates a full reconciliation report with progress status per proposal.
 * Optimized with grouped queries to avoid N+1 performance issues.
 */
async function getReconciliationReport() {
    // 1. Get all active proposals
    const proposals = await knex('custom_proposals')
        .whereIn('status', ['accepted', 'em_fornecimento'])
        .select('id', 'name', 'proposal_number', 'client_ref', 'created_at', 'status');

    if (proposals.length === 0) return [];

    const proposalIds = proposals.map(p => p.id);

    // 2. Get Ordered Totals per Proposal
    const orderedStats = await knex('proposal_lines')
        .whereIn('proposal_id', proposalIds)
        .groupBy('proposal_id')
        .select('proposal_id', knex.raw('SUM(quantity) as total_items'));

    const orderedMap = new Map(orderedStats.map(s => [s.proposal_id, parseFloat(s.total_items || 0)]));

    // 3. Get Fulfilled Totals per Proposal
    const fulfilledStats = await knex('proposal_fulfillments')
        .whereIn('proposal_id', proposalIds)
        .groupBy('proposal_id')
        .select('proposal_id', knex.raw('SUM(quantity_fulfilled) as total_fulfilled'));

    const fulfilledMap = new Map(fulfilledStats.map(s => [s.proposal_id, parseFloat(s.total_fulfilled || 0)]));

    // 4. Build Report
    return proposals.map(p => {
        const totalItems = orderedMap.get(p.id) || 0;
        const totalFulfilled = fulfilledMap.get(p.id) || 0;

        let progress = 0;
        let status = 'pending';

        if (totalItems > 0) {
            progress = Math.min(100, (totalFulfilled / totalItems) * 100);
            if (progress >= 100) status = 'completed';
            else if (progress > 0) status = 'partial';
        }

        return {
            id: p.id,
            proposal_number: p.proposal_number || p.name,
            client_ref: p.client_ref,
            total_items: totalItems,
            fulfilled_items: totalFulfilled,
            progress: parseFloat(progress.toFixed(1)),
            status: status,
            created_at: p.created_at,
            search_blob: `${p.proposal_number || ''} ${p.client_ref || ''} ${p.name || ''}`.toLowerCase()
        };
    });
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
            const hasCostData = unitPriceFactory > 0;
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
        const progress = totalOrderedCount > 0 ? Math.min(100, (totalFulfilledCount / totalOrderedCount) * 100) : 0;
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
 * Resets all matching data and re-runs reconciliation for all documents of a brand.
 * @param {string} brand - filter documents by supplier (e.g. 'NICOLAZZI' or 'RITMONIO')
 */
async function resetAllMatchings(brand = 'ALL') {
    const brandLabel = (brand || 'ALL').toUpperCase();
    console.log(`[Recon] Global Reset Started for ${brandLabel}...`);

    return await knex.transaction(async (trx) => {
        // 1. Identify all relevant invoices/proformas to re-process for this brand
        const query = trx('documents')
            .whereIn('docType', ['invoice', 'fatura', 'packing_list', 'proforma']);

        if (brandLabel !== 'ALL') {
            query.where(function () {
                this.where('supplier', 'like', `%${brandLabel}%`)
                    .orWhere('supplier', 'like', `%${brandLabel.toLowerCase()}%`);
            });
        }

        const invoices = await query.select('id');

        const invoiceIds = invoices.map(i => i.id);

        if (invoiceIds.length > 0) {
            // 2. Wipe fulfillment and line data ONLY for these documents
            await trx('proposal_fulfillments').whereIn('document_id', invoiceIds).del();
            await trx('document_lines').whereIn('document_id', invoiceIds).del();
        }

        console.log(`[Recon] Re-processing ${invoices.length} documents for ${brandLabel}...`);

        // 3. Re-run reconciliation logic
        let successCount = 0;
        for (const inv of invoices) {
            try {
                // Pass the current transaction to avoid nesting issues
                await reconcileInvoiceInternal(inv.id, null, trx);
                successCount++;
            } catch (err) {
                console.error(`[Recon] Failed to re-process doc ${inv.id}:`, err.message);
            }
        }

        console.log(`[Recon] Global Reset Complete. Successful: ${successCount}`);
        return { success: true, processed: successCount, brand: brandLabel };
    });
}

/**
 * Internal version of reconcileInvoice that accepts an optional transaction.
 */
async function reconcileInvoiceInternal(invoiceId, forceProposalId = null, existingTrx = null) {
    const action = async (trx) => {
        // 1. Get Invoice Data
        const invoice = await trx('documents').where({ id: invoiceId }).first();
        if (!invoice) throw new Error('Invoice not found');

        const data = safeParse(invoice.rawJson);
        const shippingMark = getReconciliationMark(data);

        let proposal = null;

        if (forceProposalId) {
            proposal = await trx('custom_proposals').where({ id: forceProposalId }).first();
            if (!proposal) throw new Error('Forced Proposal not found.');
        } else {
            if (!shippingMark) return { success: false, reason: 'No Proposal/Shipping Mark found in Invoice' };

            proposal = await trx('custom_proposals')
                .where('proposal_number', shippingMark)
                .whereIn('status', ['accepted', 'em_fornecimento'])
                .first();

            if (!proposal) return { success: false, reason: `Proposal '${shippingMark}' not found.` };
        }

        // Clean existing
        await trx('proposal_fulfillments').where({ document_id: invoiceId }).del();
        await trx('document_lines').where({ document_id: invoiceId }).del();

        // Insert Lines
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

        if (linesToInsert.length > 0) await trx('document_lines').insert(linesToInsert);

        // Match
        const proposalLines = await trx('proposal_lines').where({ proposal_id: proposal.id });
        const fulfillments = [];

        for (const invLine of linesToInsert) {
            const pLine = proposalLines.find(p => (p.sku || '').trim().toUpperCase() === (invLine.sku || '').trim().toUpperCase());
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

        return { success: true, proposal: proposal.name, matched_lines: fulfillments.length };
    };

    if (existingTrx) return await action(existingTrx);
    return await knex.transaction(action);
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


/**
 * Calculates high-level analytics using optimized SQL aggregations.
 * Supports filtering by a set of proposal IDs.
 */
async function getAnalytics(proposalIds = null, brand = null) {
    const vatRate = 0.22;
    const fmt = (net) => {
        const n = parseFloat(net || 0);
        const valid = isNaN(n) ? 0 : n;
        return {
            net: valid,
            iva: valid * vatRate,
            gross: valid * (1 + vatRate)
        };
    };

    console.log(`[Analytics] Service started. Brand: ${brand}, IDs: ${proposalIds?.length}`);

    // 1. Filter Proposals
    let baseQuery = knex('custom_proposals').whereIn('status', ['accepted', 'em_fornecimento']);

    if (brand && brand.toUpperCase() !== 'ALL') {
        baseQuery = baseQuery.where('brand_id', 'like', `%${brand}%`);
    }
    if (proposalIds && Array.isArray(proposalIds) && proposalIds.length > 0) {
        baseQuery = baseQuery.whereIn('id', proposalIds);
    }
    const filteredProposals = await baseQuery.select('id');
    const ids = filteredProposals.map(p => p.id);
    console.log(`[Analytics] Processing ${ids.length} proposals...`);

    if (ids.length === 0) {
        return {
            project: { sale: fmt(0), cost: fmt(0), margin: { ...fmt(0), percent: 0 } },
            realized: { sale: fmt(0), cost: fmt(0), margin: { ...fmt(0), percent: 0 } },
            logistics: { avgLeadTimeDays: 0, lateItemsCurrent: 0, totalItemsPending: 0, latePercentage: 0 }
        };
    }

    // --- PROJECTED (ESTIMATED) ---
    // We sum from proposal_lines
    // SQL can handle basic sale net, but cost factory multiplier "50+5" needs JS logic
    let totalProjectSaleNet = 0;
    let totalProjectCostNet = 0;

    // Fetch lines for projected cost calculation (complex multiplier)
    const pLines = await knex('proposal_lines')
        .whereIn('proposal_id', ids)
        .select('unit_price_commercial', 'discount_commercial_percent', 'unit_price_factory', 'discount_factory', 'quantity');

    pLines.forEach(l => {
        const qty = parseFloat(l.quantity || 0);

        // Sale
        const discComm = parseFloat(l.discount_commercial_percent || 0);
        totalProjectSaleNet += qty * parseFloat(l.unit_price_commercial || 0) * (1 - discComm / 100);

        // Cost
        const unitPriceFact = parseFloat(l.unit_price_factory || 0) || 0;
        const discFactStr = String(l.discount_factory || '');
        let factMult = 1;
        if (discFactStr && discFactStr.trim()) {
            discFactStr.split('+').forEach(d => {
                const p = parseFloat(d.trim());
                if (!isNaN(p)) factMult *= (1 - p / 100);
            });
        }
        totalProjectCostNet += (qty * unitPriceFact * factMult) || 0;
    });
    console.log('[Analytics] Project calculations done.');

    // --- REALIZED (MATCHED) ---
    // Sale Realized: Proposal price * fulfilled qty
    // Cost Realized: Document line price (already cost per user) * fulfilled qty

    // 1. Total Realized Sale
    const saleRealizedRes = await knex('proposal_fulfillments as pf')
        .join('proposal_lines as pl', 'pf.proposal_line_id', 'pl.id')
        .whereIn('pf.proposal_id', ids)
        .select(
            knex.raw('SUM(COALESCE(pf.quantity_fulfilled, 0) * COALESCE(pl.unit_price_commercial, 0) * (1 - COALESCE(pl.discount_commercial_percent, 0)/100)) as net')
        ).first();
    const totalRealSaleNet = parseFloat(saleRealizedRes.net || 0);

    // 2. Total Realized Cost (From extractions)
    // The user states extractions are already COST prices.
    const costRealizedRes = await knex('proposal_fulfillments as pf')
        .join('document_lines as dl', 'pf.doc_line_id', 'dl.id')
        .whereIn('pf.proposal_id', ids)
        .select(
            knex.raw('SUM(COALESCE(pf.quantity_fulfilled, 0) * COALESCE(dl.unit_price, 0)) as net')
        ).first();
    const totalRealCostNet = parseFloat(costRealizedRes.net || 0);
    console.log('[Analytics] Realized calculations done.');

    // --- LOGISTICS ---
    // We still need to count late items and pending
    // Simplified for debug
    const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';

    // Postgres vs SQLite compatible Late Stats
    const lateStatsQuery = knex('proposal_lines as pl')
        .leftJoin(
            knex('proposal_fulfillments').groupBy('proposal_line_id').select('proposal_line_id', knex.raw('SUM(quantity_fulfilled) as fulfilled')).as('f'),
            'pl.id', 'f.proposal_line_id'
        )
        .whereIn('pl.proposal_id', ids)
        .select(
            knex.raw('SUM(pl.quantity) as total_qty'),
            knex.raw('SUM(COALESCE(f.fulfilled, 0)) as total_fulfilled'),
            knex.raw(`SUM(CASE WHEN pl.predicted_ship_date < CURRENT_TIMESTAMP AND (pl.quantity - COALESCE(f.fulfilled, 0)) > 0 THEN (pl.quantity - COALESCE(f.fulfilled, 0)) ELSE 0 END) as late_qty`)
        );

    const lateStats = await lateStatsQuery.first() || { total_qty: 0, total_fulfilled: 0, late_qty: 0 };

    const totalItemsPending = Math.max(0, (parseFloat(lateStats.total_qty || 0) - parseFloat(lateStats.total_fulfilled || 0)));
    const lateItemsCount = parseFloat(lateStats.late_qty || 0);

    // Simplified/Disabled for debug to avoid hang
    const avgLeadTime = 0;
    /*
        const leadTimeRes = await knex('proposal_fulfillments as pf')
            .join('documents as d', 'pf.document_id', 'd.id')
            .join('custom_proposals as cp', 'pf.proposal_id', 'cp.id')
            .whereIn('pf.proposal_id', ids)
            .whereNotNull('d.date')
            .select(
                knex.raw('AVG(ABS(JULIANDAY(d.date) - JULIANDAY(COALESCE(cp.order_confirmation_date, cp.created_at)))) as avg_days')
            ).first();
    
        const avgLeadTime = Math.round(parseFloat(leadTimeRes.avg_days || 0));
    */

    const projectMarginNet = totalProjectSaleNet - totalProjectCostNet;
    const realMarginNet = totalRealSaleNet - totalRealCostNet;
    console.log(`[Analytics] Math done. Margin: ${projectMarginNet}`);

    return {
        project: {
            sale: fmt(totalProjectSaleNet),
            cost: fmt(totalProjectCostNet),
            margin: { ...fmt(projectMarginNet), percent: totalProjectSaleNet > 0 ? (projectMarginNet / totalProjectSaleNet) * 100 : 0 }
        },
        realized: {
            sale: fmt(totalRealSaleNet),
            cost: fmt(totalRealCostNet),
            margin: { ...fmt(realMarginNet), percent: totalRealSaleNet > 0 ? (realMarginNet / totalRealSaleNet) * 100 : 0 }
        },
        logistics: {
            avgLeadTimeDays: avgLeadTime,
            lateItemsCurrent: lateItemsCount,
            totalItemsPending: totalItemsPending,
            latePercentage: totalItemsPending > 0 ? (Math.max(0, (lateItemsCount / totalItemsPending) * 100)).toFixed(1) : 0
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
    resetAllMatchings,
    discoverMatches,
    exportReconciliationExcel,
    getAnalytics,
    exportLateItemsExcel
};
