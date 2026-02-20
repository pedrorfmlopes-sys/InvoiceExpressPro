const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const ProposalExporter = require('./ProposalExporter');
const CustomerService = require('../crm/CustomerService');
const path = require('path');

class ProposalStudioService {
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
            name: `Proposta: ${doc.docNumber || 'Sem Número'} - ${doc.customer || 'Consumidor Final'}`,
            brand_id: doc.supplier && /NICOLAZZI/i.test(doc.supplier) ? 'nicolazzi' : 'other',
            client_ref: doc.customer || cust.name || sourceData.customer,
            project_ref: project || doc.project || sourceData.customerRef,
            status: 'draft',
            original_doc_id: docId,
            metadata: JSON.stringify({
                doc_date: sourceData.senderDate || doc.docDate || (sourceData.dates && sourceData.dates.issued),
                doc_number: sourceData.docNumber || doc.docNumber,
                our_ref: sourceData.ourRef || (sourceData.docRefs && sourceData.docRefs.customerRef),
                client_project_name: sourceData.customerRef || sourceData.projectLabel || (sourceData.docRefs && sourceData.docRefs.customerRef) || '',
                client_vat: vat,
                client_email: cust.email || sourceData.customerEmail,
                client_phone: cust.phone || sourceData.customerPhone,
                billing_address: billingAddress,
                shipping_address: deliveryAddress,
                shipping_is_billing: !deliveryAddress || deliveryAddress === billingAddress,
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
                brand_meta: l.extra || {}
            }),
            created_at: new Date(),
            updated_at: new Date()
        }));

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
        if (filters.client_ref) q.where('custom_proposals.client_ref', 'ilike', `%${filters.client_ref}%`);

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
                branding_config: header.branding_config ? JSON.stringify(header.branding_config) : undefined,
                metadata: header.metadata ? JSON.stringify(header.metadata) : undefined,
                updated_at: new Date()
            });
        }
        // ... (lines update part)

        if (lines) {
            // Simple approach: delete and recreat lines or update one by one.
            // For stability, we'll update if ID exists, or delete all and re-insert.
            // Let's do delete/re-insert for simplicity and to handle re-ordering easily.
            await knex('proposal_lines').where({ proposal_id: id }).delete();

            const newLines = lines.map((l, index) => ({
                id: uuidv4(),
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
                extra_attributes: JSON.stringify(l.extra_attributes || {}),
                created_at: l.created_at || new Date(),
                updated_at: new Date()
            }));

            if (newLines.length > 0) {
                await knex('proposal_lines').insert(newLines);
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

        await knex('custom_proposals').where({ id }).update({
            ...data,
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
}

module.exports = new ProposalStudioService();
