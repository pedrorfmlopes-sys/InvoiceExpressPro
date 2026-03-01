const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const ProposalExporter = require('./ProposalExporter');
const CustomerService = require('../crm/CustomerService');
const CatalogService = require('../catalog/service');
const path = require('path');


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
            project_ref: project || doc.project || sourceData.customerRef,
            status: 'draft',
            original_doc_id: docId,
            metadata: JSON.stringify({
                doc_date: sourceData.senderDate || doc.docDate || (sourceData.dates && sourceData.dates.issued),
                doc_number: sourceData.docNumber || doc.docNumber,
                our_ref: sourceData.ourRef || (sourceData.docRefs && sourceData.docRefs.customerRef),
                client_project_name: sourceData.customerRef || sourceData.projectLabel || (sourceData.docRefs && (sourceData.docRefs.customerOrder?.number || sourceData.docRefs.customerRef)) || '',
                client_vat: vat,
                client_email: cust.email || sourceData.customerEmail,
                client_phone: cust.phone || sourceData.customerPhone,
                billing_address: billingAddress,
                shipping_address: deliveryAddress,
                shipping_is_billing: !deliveryAddress || deliveryAddress === billingAddress,
                show_technical_details: true,
                notes: ''
            }),
            created_at: new Date(),
            updated_at: new Date()
        };

        await knex('custom_proposals').insert(proposal);

        // 4. Create Proposal Lines
        const rawLines = sourceData.lines || [];
        const proposalLines = rawLines.map((l, index) => ({
            id: uuidv4(),
            proposal_id: proposalId,
            sku: l.sku || l.code || '',
            description: l.description || '',
            quantity: parseFloat(l.quantity || 1),
            unit_price_factory: parseFloat(l.price || l.unitPrice || 0),
            unit_price_commercial: parseFloat(l.price || l.unitPrice || 0), // Default to factory price
            discount_factory: String(l.discountPercent || l.discountText || '0'),
            discount_commercial_percent: 0,
            vat_rate: String(l.vat || l.vatRate || '23'),
            sort_order: index,
            extra_attributes: JSON.stringify({
                original_index: index,
                brand_meta: l.extra || {},
                original_description: l.description || '' // Preserving extracted description
            }),
            created_at: new Date(),
            updated_at: new Date()
        }));

        // 5. Enrich Lines with Catalog Data (Finish, Lead Time, etc)
        const brandId = proposal.brand_id;
        for (const line of proposalLines) {
            await this.enrichLineWithCatalog(brandId, line);
        }

        if (proposalLines.length > 0) {
            await knex('proposal_lines').insert(proposalLines);
        }


        return { proposalId, linesCount: proposalLines.length };
    }

    async getProposals(project, filters = {}) {
        // Calculate total including VAT in a subquery
        const subquery = knex('proposal_lines')
            .select(knex.raw('SUM((quantity * unit_price_commercial * (1 - discount_commercial_percent / 100)) * (1 + CAST(vat_rate AS FLOAT) / 100))'))
            .whereRaw('proposal_id = custom_proposals.id')
            .as('total_amount');

        const shipDateQuery = knex('proposal_lines')
            .max('predicted_ship_date')
            .whereRaw('proposal_id = custom_proposals.id')
            .as('max_ship_date');

        const q = knex('custom_proposals')
            .leftJoin('documents', 'custom_proposals.original_doc_id', 'documents.id')
            .select(
                'custom_proposals.*',
                'documents.docNumber as source_doc_number',
                subquery,
                shipDateQuery
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
                    .orWhere('custom_proposals.metadata', 'like', term);
            });
        }

        return await q;
    }

    async getConsolidatedProposalsData(project, filters = {}) {
        const proposals = await this.getProposals(project, filters);
        for (const p of proposals) {
            p.lines = await knex('proposal_lines').where({ proposal_id: p.id }).orderBy('sort_order', 'asc');
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

        const safeParse = (val) => {
            if (!val) return null;
            if (typeof val === 'string') {
                try {
                    return JSON.parse(val);
                } catch (e) {
                    console.warn('[ProposalService] Failed to parse JSON:', val);
                    return null;
                }
            }
            return val; // Already an object
        };

        return {
            ...proposal,
            branding_config: safeParse(proposal.branding_config),
            metadata: safeParse(proposal.metadata),
            lines: lines.map(l => ({
                ...l,
                extra_attributes: safeParse(l.extra_attributes)
            }))
        };
    }

    async updateProposal(id, data) {
        const { lines, ...header } = data;

        if (header.status === 'accepted') {
            await this.handleAcceptedStatus(id);
        }

        if (Object.keys(header).length > 0) {
            await knex('custom_proposals').where({ id }).update({
                ...header,
                branding_config: header.branding_config !== undefined ? header.branding_config : undefined,
                metadata: header.metadata !== undefined ? header.metadata : undefined,
                lead_time_rules: header.lead_time_rules !== undefined ? header.lead_time_rules : undefined,
                updated_at: new Date()
            });
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
                if (!existingBySku[l.sku]) existingBySku[l.sku] = l;
            });

            const processedIds = new Set();

            for (let index = 0; index < lines.length; index++) {
                const l = lines[index];
                // Find existing line: prefer matching by ID (if client sends it), then by SKU
                const existing = (l.id && existingById[l.id]) || existingBySku[l.sku];

                const lineData = {
                    proposal_id: id,
                    sku: l.sku,
                    description: l.description,
                    quantity: parseFloat(l.quantity),
                    unit_price_factory: parseFloat(l.unit_price_factory),
                    unit_price_commercial: parseFloat(l.unit_price_commercial),
                    discount_factory: String(l.discount_factory),
                    discount_commercial_percent: parseFloat(l.discount_commercial_percent),
                    vat_rate: String(l.vat_rate),
                    sort_order: index,
                    lead_time_weeks: l.lead_time_weeks !== undefined ? l.lead_time_weeks : null,
                    predicted_ship_date: l.predicted_ship_date ? new Date(l.predicted_ship_date) : null,
                    is_manual_override: l.is_manual_override || false,
                    production_category: l.production_category || null,
                    extra_attributes: JSON.stringify(l.extra_attributes || {}),
                    updated_at: new Date()
                };

                if (existing) {
                    // Detect SKU change to trigger re-enrichment
                    if (existing.sku !== l.sku && !l.is_manual_override) {
                        await this.enrichLineWithCatalog(header.brand_id || existing.brand_id, lineData);
                    }
                    // UPDATE — preserving the existing UUID
                    await knex('proposal_lines').where({ id: existing.id }).update(lineData);
                    processedIds.add(existing.id);
                } else {
                    // INSERT — new line
                    const newId = uuidv4();
                    // Enrich new line
                    if (!lineData.is_manual_override) {
                        await this.enrichLineWithCatalog(header.brand_id || 'other', lineData);
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
                const hasFulfillments = await knex('proposal_fulfillments')
                    .where({ proposal_line_id: removed.id }).count('* as cnt').first();
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

        // Serialize JSON fields for PostgreSQL compatibility
        // (SQLite accepts raw objects, PostgreSQL requires JSON strings - Knex handles this)
        const safeData = { ...data };

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
