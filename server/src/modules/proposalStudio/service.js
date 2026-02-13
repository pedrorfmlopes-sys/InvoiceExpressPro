const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('../../storage/SatelliteStorage');
const ProposalExporter = require('./ProposalExporter');
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
        const proposal = {
            id: proposalId,
            name: `Proposta: ${doc.docNumber || 'Sem Número'} - ${doc.customer || 'Consumidor Final'}`,
            brand_id: doc.supplier && /NICOLAZZI/i.test(doc.supplier) ? 'nicolazzi' : 'other',
            client_ref: doc.customer || sourceData.customer,
            project_ref: doc.project_ref || sourceData.customerRef,
            status: 'draft',
            original_doc_id: docId,
            metadata: JSON.stringify({
                delivery_address: sourceData.deliveryAddress || sourceData.address,
                doc_date: sourceData.senderDate || doc.docDate,
                doc_number: sourceData.docNumber || doc.docNumber,
                our_ref: sourceData.ourRef,
                client_vat: sourceData.customerVat || sourceData.vatNumber,
                client_email: sourceData.customerEmail,
                client_phone: sourceData.customerPhone,
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

    async getProposals(project) {
        const q = knex('custom_proposals').orderBy('updated_at', 'desc');
        if (project) {
            q.where(function () {
                this.where('project_ref', project).orWhereNull('project_ref');
            });
        }
        return await q;
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

        if (Object.keys(header).length > 0) {
            await knex('custom_proposals').where({ id }).update({
                ...header,
                branding_config: header.branding_config ? JSON.stringify(header.branding_config) : undefined,
                metadata: header.metadata ? JSON.stringify(header.metadata) : undefined,
                updated_at: new Date()
            });
        }

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
