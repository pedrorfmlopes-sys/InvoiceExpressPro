const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const ProposalExporter = require('./ProposalExporter');
const CustomerService = require('../crm/CustomerService');
const CatalogService = require('../catalog/service');
const { buildValidFulfillmentsQuery } = require('../reconciliation/fulfillmentIntegrity');
const path = require('path');
const {
    safeParseJson,
    normalizeProposalLineInput,
    normalizeStoredProposalLine,
    calculateProposalMetrics
} = require('./lineUtils');


class ProposalStudioService {
    /**
     * Creates a blank custom proposal (manual creation).
     */
    async createBlankProposal(project, name, brandId) {
        const proposalId = uuidv4();

        // Generate a clear ID if not passing a specific name
        let propName = name;
        let propNumber = '';
        if (!name) {
            const count = await knex('custom_proposals').where('proposal_number', 'like', 'PM-%').count('* as c');
            const numStr = (count[0].c + 1).toString().padStart(4, '0');
            const dateStr = new Date().toISOString().split('T')[0].split('-').join('').slice(2);
            propNumber = `PM${dateStr}-${numStr}`;
            propName = `Proposta Manual: ${propNumber}`;
        }

        await knex('custom_proposals').insert({
            id: proposalId,
            project_ref: project || null,
            name: propName,
            proposal_number: propNumber,
            brand_id: brandId || 'MULTIMARCAS',
            client_ref: '',
            status: 'draft',
            metadata: JSON.stringify({ our_ref: '' }),
            branding_config: JSON.stringify({
                vat_number: '',
                billing_address: '',
                shipping_address: '',
                conditions_text: '1. Validade: 30 dias\n2. Pagamento: Pronto Pagamento',
                warranty_text: 'Garantia standard do fabricante.'
            }),
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
        });

        // Generate the proposal number (optional, logic relies on status transitions normally, but we can init empty)
        return { id: proposalId, message: 'Nova Proposta criada com sucesso!' };
    }

    async getBrandSettings(brandId) {
        if (!brandId) return null;
        return knex('brand_settings').where({ brand_id: brandId.toLowerCase() }).first();
    }

    async saveBrandSettings(brandId, settings) {
        const existing = await this.getBrandSettings(brandId);
        const data = {
            brand_id: brandId.toLowerCase(),
            packaging_cost_type: settings.packagingCostType,
            packaging_cost_value: settings.packagingCostValue,
            packaging_cost_base: settings.packagingCostBase,
            updated_at: new Date()
        };

        if (existing) {
            await knex('brand_settings').where({ id: existing.id }).update(data);
        } else {
            await knex('brand_settings').insert({ ...data, id: uuidv4() });
        }
        return this.getBrandSettings(brandId);
    }

    /**
     * Clones an existing extraction into a new custom proposal.
     */
    async cloneToProposal(project, docId, userId) {
        // 1. Get original doc metadata
        const doc = await knex('documents').where({ project, id: docId }).first();
        if (!doc) throw new Error('Documento não encontrado');

        // 2. Attempt to get high-fidelity data from Satellite (Nicolazzi, etc)
        // For now, we prioritze nicolazzi_proformas then nicolazzi_invoices
        let highFidData = await SatelliteStorage.getData('nicolazzi_proformas', docId);
        if (!highFidData) {
            highFidData = await SatelliteStorage.getData('nicolazzi_invoices', docId);
        }

        // Fallback to rawJson if satellite is empty
        const sourceData = highFidData || (doc.rawJson ? JSON.parse(doc.rawJson) : doc);

        // 3. Create Proposal Header
        const proposalId = uuidv4();
        // Extraction Mapping Logic (Handles V2/Satellite structure)
        const entities = sourceData.entities || {};
        const cust = entities.customer || {};
        const ship = entities.shipping || entities.shipTo || {};

        const vat = cust.vat || sourceData.customerVat || sourceData.vatNumber || doc.vatNumber;

        // CRM Lookup for Billing Address
        let billingAddress = cust.address || doc.address || sourceData.address || '';
        if (vat) {
            try {
                const crmCustomer = await CustomerService.getByVat(project, vat);
                if (crmCustomer && crmCustomer.address) {
                    billingAddress = crmCustomer.address; // CRM data is the source of truth for billing
                }
            } catch (err) {
                console.warn(`[ProposalStudio] CRM lookup failed for VAT ${vat}:`, err.message);
            }
        }

        const deliveryAddress = ship.address || sourceData.deliveryAddress || sourceData.address || '';

        const proposal = {
            id: proposalId,
            proposal_number: sourceData.docNumber || doc.docNumber || sourceData.shippingMarks,
            name: `Proposta: ${doc.docNumber || 'Sem Número'}`,
            brand_id: doc.supplier && /NICOLAZZI/i.test(doc.supplier) ? 'nicolazzi' : (/RITMONIO/i.test(doc.supplier) ? 'ritmonio' : 'other'),

            client_ref: doc.customer || cust.name || sourceData.customer,
            project_ref: project || doc.project || 'default', // Workspace context is mandatory for visibility
            status: 'draft',
            original_doc_id: docId,
            metadata: JSON.stringify({
                doc_date: sourceData.senderDate || doc.docDate || (sourceData.dates && sourceData.dates.issued),
                doc_number: sourceData.docNumber || doc.docNumber,
                our_ref: sourceData.ourRef || (sourceData.docRefs && sourceData.docRefs.customerRef),
                client_project_name: sourceData.customerRef || sourceData.projectLabel || (sourceData.docRefs && (sourceData.docRefs.customerOrder?.number || sourceData.docRefs.customerRef)) || sourceData.metadata?.project_note || '',
                client_vat: vat,
                client_email: cust.email || sourceData.customerEmail,
                client_phone: cust.phone || sourceData.customerPhone,
                billing_address: billingAddress,
                shipping_address: deliveryAddress,
                shipping_is_billing: !deliveryAddress || deliveryAddress === billingAddress,
                show_technical_details: true,
                notes: '',
                packaging_costs: [] // Will be populated after lines are created
            }),
            created_at: new Date(),
            updated_at: new Date()
        };

        await knex('custom_proposals').insert(proposal);

        // 4. Create Proposal Lines
        const rawLines = sourceData.lines || [];
        const proposalLines = rawLines.map((l, index) => ({
            id: uuidv4(),
            ...normalizeProposalLineInput({
                ...l,
                extra_attributes: {
                    original_index: index,
                    brand_meta: l.extra || {},
                    original_description: l.description || ''
                }
            }, {
                proposalId,
                sortOrder: index,
                defaultItemQuantity: 1,
                defaultVatRate: '23'
            }),
            created_at: new Date()
        }));

        // 5. Enrich Lines with Catalog Data (Finish, Lead Time, etc)
        const brandId = proposal.brand_id;
        for (const line of proposalLines) {
            if (line.line_type === 'comment') continue;
            await this.enrichLineWithCatalog(brandId, line);
        }

        if (proposalLines.length > 0) {
            await knex('proposal_lines').insert(proposalLines);
        }

        // 6. Final Sub-Total logic for Packaging Costs
        const packagingCosts = [];
        const brandsInDoc = new Set();
        proposalLines.forEach(l => {
            const b = l.brand_id || (l.extra_attributes && JSON.parse(l.extra_attributes).brand_id) || proposal.brand_id;
            if (b) brandsInDoc.add(b.toLowerCase());
        });

        for (const bid of brandsInDoc) {
            const settings = await this.getBrandSettings(bid);
            if (settings && settings.packaging_cost_value > 0) {
                packagingCosts.push({
                    brandId: bid,
                    enabled: true,
                    type: settings.packaging_cost_type,
                    value: settings.packaging_cost_value,
                    base: settings.packaging_cost_base,
                    description: `Custo Embalagem ${bid.toUpperCase()}`
                });
            }
        }

        // Add extracted packaging cost if exists in source
        if (sourceData.metadata?.packaging_cost || sourceData.packagingCost) {
            const val = parseFloat(sourceData.metadata?.packaging_cost || sourceData.packagingCost);
            if (val > 0) {
                const supplier = (doc.supplier || '').toLowerCase();
                const existing = packagingCosts.find(p => p.brandId === supplier);
                if (existing) {
                    existing.value = val;
                    existing.type = 'fixed';
                    existing.enabled = true;
                } else {
                    packagingCosts.push({
                        brandId: supplier || 'other',
                        enabled: true,
                        type: 'fixed',
                        value: val,
                        base: 'liquid',
                        description: 'Custo Embalagem (Extraído)'
                    });
                }
            }
        }

        if (packagingCosts.length > 0) {
            const currentMetadata = JSON.parse(proposal.metadata);
            currentMetadata.packaging_costs = packagingCosts;
            await knex('custom_proposals')
                .where({ id: proposalId })
                .update({ metadata: JSON.stringify(currentMetadata) });
        }

        return { proposalId, linesCount: proposalLines.length };
    }

    async getProposals(project, filters = {}) {
        const q = knex('custom_proposals')
            .leftJoin('documents', 'custom_proposals.original_doc_id', 'documents.id')
            .select(
                'custom_proposals.*',
                'documents.docNumber as source_doc_number',
                'documents.docType as source_doc_type',
                'documents.supplier as source_supplier'
            )
            .orderBy('custom_proposals.updated_at', 'desc');

        if (project) {
            q.where(function () {
                this.where('custom_proposals.project_ref', project).orWhereNull('custom_proposals.project_ref');
            });
        }

        if (filters.status) q.where('custom_proposals.status', filters.status);
        if (filters.brand_id) q.where('custom_proposals.brand_id', filters.brand_id);

        if (filters.client_ref) {
            const term = `%${filters.client_ref}%`;
            q.where(function () {
                this.where('custom_proposals.name', 'like', term)
                    .orWhere('custom_proposals.client_ref', 'like', term)
                    .orWhere('documents.docNumber', 'like', term)
                    .orWhereRaw('CAST(custom_proposals.metadata AS TEXT) LIKE ?', [term])
                    .orWhereExists(function () {
                        this.select('*')
                            .from('proposal_lines')
                            .whereRaw('proposal_lines.proposal_id = custom_proposals.id')
                            .andWhere(function () {
                                this.where('proposal_lines.sku', 'like', term)
                                    .orWhere('proposal_lines.description', 'like', term);
                            });
                    });
            });
        }

        const proposals = await q;

        const proposalIds = proposals.map(p => p.id);
        const proposalLines = proposalIds.length > 0
            ? await knex('proposal_lines')
                .whereIn('proposal_id', proposalIds)
                .orderBy('sort_order', 'asc')
            : [];

        const proposalLinesMap = {};
        proposalLines.forEach(line => {
            if (!proposalLinesMap[line.proposal_id]) proposalLinesMap[line.proposal_id] = [];
            proposalLinesMap[line.proposal_id].push(line);
        });

        proposals.forEach(p => {
            const metrics = calculateProposalMetrics(proposalLinesMap[p.id] || []);
            p.total_amount = metrics.totalAmount;
            p.max_ship_date = metrics.maxShipDate;
        });

        // --- PHASE 21: Fetch associated documents ---
        if (proposalIds.length > 0) {
            // 1. Fulfillment links
            const fulfillmentDocs = await buildValidFulfillmentsQuery()
                .join('documents', 'pf.document_id', 'documents.id')
                .whereIn('pf.proposal_id', proposalIds)
                .select(
                    'pf.proposal_id as proposal_id',
                    'documents.id',
                    'documents.docNumber',
                    'documents.docType',
                    'documents.supplier'
                )
                .distinct();

            const docsMap = {};
            fulfillmentDocs.forEach(d => {
                if (!docsMap[d.proposal_id]) docsMap[d.proposal_id] = [];
                docsMap[d.proposal_id].push(d);
            });

            proposals.forEach(p => {
                const docs = docsMap[p.id] || [];
                // Also include the original_doc if it's not already there
                if (p.original_doc_id) {
                    const alreadyPresent = docs.some(d => d.id === p.original_doc_id);
                    if (!alreadyPresent) {
                        docs.unshift({
                            id: p.original_doc_id,
                            docNumber: p.source_doc_number,
                            docType: p.source_doc_type,
                            supplier: p.source_supplier,
                            proposal_id: p.id
                        });
                    }
                }
                p.associatedDocuments = docs;
            });
        }

        return proposals;
    }

    async getConsolidatedProposalsData(project, filters = {}) {
        const proposals = await this.getProposals(project, filters);
        for (const p of proposals) {
            const lines = await knex('proposal_lines').where({ proposal_id: p.id }).orderBy('sort_order', 'asc');
            p.lines = lines.map(normalizeStoredProposalLine);
        }
        return proposals;
    }

    async generateConsolidatedExcel(project, filters = {}) {
        const data = await this.getConsolidatedProposalsData(project, filters);
        return await ProposalExporter.generateConsolidatedItemsExcel(data);
    }

    async getProposal(id) {
        const proposal = await knex('custom_proposals').where({ id }).first();
        if (!proposal) return null;

        const lines = await knex('proposal_lines').where({ proposal_id: id }).orderBy('sort_order', 'asc');

        // --- PHASE 21: Fetch associated documents ---
        // 1. Original doc
        let associatedDocuments = [];
        if (proposal.original_doc_id) {
            const orgDoc = await knex('documents').where({ id: proposal.original_doc_id }).first();
            if (orgDoc) {
                associatedDocuments.push({
                    id: orgDoc.id,
                    docNumber: orgDoc.docNumber,
                    docType: orgDoc.docType,
                    supplier: orgDoc.supplier,
                    isOriginal: true
                });
            }
        }

        // 2. Fulfillments
        const fulfillmentDocs = await buildValidFulfillmentsQuery()
            .join('documents', 'pf.document_id', 'documents.id')
            .where('pf.proposal_id', id)
            .select(
                'documents.id',
                'documents.docNumber',
                'documents.docType',
                'documents.supplier'
            )
            .distinct();

        fulfillmentDocs.forEach(d => {
            if (!associatedDocuments.some(existing => existing.id === d.id)) {
                associatedDocuments.push(d);
            }
        });

        return {
            ...proposal,
            branding_config: safeParseJson(proposal.branding_config),
            metadata: safeParseJson(proposal.metadata),
            lines: lines.map(normalizeStoredProposalLine),
            associatedDocuments
        };
    }

    async updateProposal(id, data) {
        const { lines, associatedDocuments, ...header } = data;
        const currentProposal = await knex('custom_proposals').where({ id }).first();

        if (header.status === 'accepted') {
            await this.handleAcceptedStatus(id);
        }

        if (Object.keys(header).length > 0) {
            // Postgres Fix: Explicitly cast JSONB columns using knex.raw to avoid syntax errors
            const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';

            const updates = { ...header, updated_at: new Date() };

            if (isPg) {
                if (header.branding_config !== undefined) updates.branding_config = knex.raw('?::jsonb', [JSON.stringify(header.branding_config || {})]);
                if (header.metadata !== undefined) updates.metadata = knex.raw('?::jsonb', [JSON.stringify(header.metadata || {})]);
                if (header.lead_time_rules !== undefined) updates.lead_time_rules = knex.raw('?::jsonb', [JSON.stringify(header.lead_time_rules || [])]);
            } else {
                // SQLite (Production) - Must explicitly stringify JSON columns
                updates.branding_config = (header.branding_config && typeof header.branding_config === 'object') ? JSON.stringify(header.branding_config) : null;
                updates.metadata = (header.metadata && typeof header.metadata === 'object') ? JSON.stringify(header.metadata) : null;
                updates.lead_time_rules = (header.lead_time_rules && Array.isArray(header.lead_time_rules)) ? JSON.stringify(header.lead_time_rules) : null;
            }

            await knex('custom_proposals').where({ id }).update(updates);
        }
        // ... (lines update part)

        if (lines) {
            // SAFE UPSERT: preserve existing line IDs so proposal_fulfillments links are never broken.
            // Strategy:
            //   1. Load current lines from DB (keyed by SKU)
            //   2. UPDATE existing lines (matched by SKU or id) — keeps their UUID
            //   3. INSERT truly new lines (new UUID)
            //   4. DELETE lines that were removed from the proposal (not in new list)
            //      BUT only if they have NO fulfillments linked (to avoid data loss)

            const existingLines = await knex('proposal_lines').where({ proposal_id: id });
            // Build lookup: prefer id match first, then sku match
            const existingById = {};
            const existingBySku = {};
            existingLines.forEach(l => {
                existingById[l.id] = l;
                // Keep first occurrence per SKU (handle duplicates gracefully)
                if (l.sku && !existingBySku[l.sku]) existingBySku[l.sku] = l;
            });

            const processedIds = new Set();
            const proposalBrandId = header.brand_id || currentProposal?.brand_id || 'other';

            for (let index = 0; index < lines.length; index++) {
                const l = lines[index];
                // Find existing line: prefer matching by ID (if client sends it), then by SKU
                const existing = (l.id && existingById[l.id]) || (l.sku ? existingBySku[l.sku] : null);

                const lineData = normalizeProposalLineInput(l, {
                    proposalId: id,
                    sortOrder: index,
                    defaultItemQuantity: 0,
                    defaultVatRate: '23'
                });

                if (existing) {
                    // Detect SKU change to trigger re-enrichment
                    if (lineData.line_type !== 'comment' && existing.sku !== lineData.sku && !lineData.is_manual_override) {
                        await this.enrichLineWithCatalog(proposalBrandId, lineData);
                    }
                    // UPDATE — preserving the existing UUID
                    await knex('proposal_lines').where({ id: existing.id }).update(lineData);
                    processedIds.add(existing.id);
                } else {
                    // INSERT — new line
                    const newId = uuidv4();
                    // Enrich new line
                    if (lineData.line_type !== 'comment' && !lineData.is_manual_override) {
                        await this.enrichLineWithCatalog(proposalBrandId, lineData);
                    }
                    await knex('proposal_lines').insert({
                        ...lineData,
                        id: newId,
                        created_at: new Date()
                    });
                    processedIds.add(newId);
                }
            }


            // DELETE lines that are no longer in the proposal — but ONLY if they have no fulfillments
            const removedLines = existingLines.filter(l => !processedIds.has(l.id));
            for (const removed of removedLines) {
                const hasFulfillments = await buildValidFulfillmentsQuery()
                    .where('pf.proposal_line_id', removed.id)
                    .count('* as cnt')
                    .first();
                if (parseInt(hasFulfillments.cnt) === 0) {
                    await knex('proposal_lines').where({ id: removed.id }).delete();
                } else {
                    // Keep the line but mark it as removed (qty 0 or a flag) so it's not shown
                    await knex('proposal_lines').where({ id: removed.id }).update({
                        sort_order: 9999,
                        updated_at: new Date()
                    });
                    console.log(`[ProposalStudio] Line ${removed.sku} retained (has fulfillments)`);
                }
            }
        }

        return this.getProposal(id);
    }

    async deleteProposal(id) {
        await knex('proposal_lines').where({ proposal_id: id }).delete();
        await knex('custom_proposals').where({ id: id }).delete();
    }

    async patchProposal(id, data) {
        if (data.status === 'accepted') {
            await this.handleAcceptedStatus(id);
        }

        const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';
        const { associatedDocuments, lines, ...safeData } = data;

        if (isPg) {
            // Explicitly cast JSONB columns for Postgres
            if (safeData.metadata !== undefined) safeData.metadata = knex.raw('?::jsonb', [JSON.stringify(safeData.metadata || {})]);
            if (safeData.branding_config !== undefined) safeData.branding_config = knex.raw('?::jsonb', [JSON.stringify(safeData.branding_config || {})]);
            if (safeData.lead_time_rules !== undefined) safeData.lead_time_rules = knex.raw('?::jsonb', [JSON.stringify(safeData.lead_time_rules || [])]);
        } else {
            // Local SQLite (Production)
            if (safeData.metadata !== undefined) {
                safeData.metadata = (safeData.metadata && typeof safeData.metadata === 'object') ? safeData.metadata : null;
            }
            if (safeData.branding_config !== undefined) {
                safeData.branding_config = (safeData.branding_config && typeof safeData.branding_config === 'object') ? safeData.branding_config : null;
            }
            if (safeData.lead_time_rules !== undefined) {
                safeData.lead_time_rules = (safeData.lead_time_rules && Array.isArray(safeData.lead_time_rules)) ? safeData.lead_time_rules : null;
            }
        }

        await knex('custom_proposals').where({ id }).update({
            ...safeData,
            updated_at: new Date()
        });

        return this.getProposal(id);
    }

    async handleAcceptedStatus(proposalId) {
        const proposal = await knex('custom_proposals').where({ id: proposalId }).first();
        if (!proposal) return;

        const metadata = typeof proposal.metadata === 'string' ? JSON.parse(proposal.metadata) : (proposal.metadata || {});
        const projectRef = proposal.project_ref; // General Project/Workspace (e.g. 'Proj_2026')
        const brandId = proposal.brand_id;
        const subProject = metadata.our_ref || ''; // Specific Proposal Project (displayed as "Referência")

        // Mark siblings as 'closed_other' only if they belong to the same Workspace, same Brand,
        // AND share the same specific Proposal Project (Sub-Project).
        let query = knex('custom_proposals')
            .where({
                project_ref: projectRef,
                brand_id: brandId
            })
            .whereNot({ id: proposalId })
            .whereNot({ status: 'accepted' });

        if (subProject) {
            // Match the same sub-project exactly
            query = query.whereRaw("metadata->>'our_ref' = ?", [subProject]);
        } else {
            // If the accepted proposal has no specific project reference,
            // only close others that also have no specific project reference.
            // This prevents "empty" ones from closing proposals that actually have a project assigned.
            query = query.whereRaw("(metadata->>'our_ref' IS NULL OR metadata->>'our_ref' = '')");
        }

        await query.update({
            status: 'closed_other',
            updated_at: new Date()
        });
    }

    async generatePdf(id) {
        const proposal = await this.getProposal(id);
        if (!proposal) throw new Error('Proposta não encontrada');

        const logoPath = path.join(process.cwd(), 'config', 'logo.png');
        return await ProposalExporter.generatePdf(proposal, logoPath);
    }

    async generateExcel(id) {
        const proposal = await this.getProposal(id);
        if (!proposal) throw new Error('Proposta não encontrada');

        return await ProposalExporter.generateExcel(proposal);
    }

    async deleteProposal(id) {
        await knex.transaction(async trx => {
            // Cascade delete manually (SQLite without PRAGMA foreign_keys = ON might orphan records)
            await trx('proposal_fulfillments').where({ proposal_id: id }).del();
            await trx('proposal_lines').where({ proposal_id: id }).del();
            await trx('custom_proposals').where({ id }).del();
        });
    }

    /**
     * Helper to Enrich a Proposal Line with Catalog Data.
     * Implements hierarchal logic: Finish > Collection > Brand.
     */
    async enrichLineWithCatalog(brand, line) {
        if (!line.sku) return;

        try {
            const res = await CatalogService.resolveItem(brand, line.sku);
            if (!res || !res.success) return;

            const extra = typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : (line.extra_attributes || {});

            // 1. Update Finish info
            if (res.finishCode) {
                extra.finishCode = res.finishCode;
                extra.finishNote = res.finishNote;
                if (res.finish) extra.brand_meta = { ...(extra.brand_meta || {}), ...res.finish };
            }

            // 2. Update Series/Collection info
            if (res.series) {
                extra.series = res.series;
            }

            // 3. Update Lead Time (from resolution)
            if (res.leadTimeWeeks !== null && res.leadTimeWeeks !== undefined) {
                line.lead_time_weeks = res.leadTimeWeeks;
            }

            line.extra_attributes = JSON.stringify(extra);

            // 4. Trigger predicted date calculation if we have an order date
            const proposal = await knex('custom_proposals').where({ id: line.proposal_id }).first();
            if (proposal && proposal.order_confirmation_date && line.lead_time_weeks !== null) {
                const { calculateShipDate } = require('../logistics/calendarEngine');
                const shipDate = await calculateShipDate(
                    new Date(proposal.order_confirmation_date),
                    { value: line.lead_time_weeks, unit: 'weeks' },
                    brand
                );
                if (shipDate) line.predicted_ship_date = shipDate;
            }
        } catch (err) {
            console.error('[ProposalStudioService] Enrichment Error:', err.message);
        }
    }
}


module.exports = new ProposalStudioService();
