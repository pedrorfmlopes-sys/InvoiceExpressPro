const knex = require('../../db/knex');
const { v4: uuidv4 } = require('uuid');
const SatelliteStorage = require('../../storage/SatelliteStorage');

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
        // Since we don't have a project col in custom_proposals yet (I missed it in migration), 
        // we'll filter by original_doc_id joined with documents.
        // Actually, I should have added project to custom_proposals. I'll add it in a followup if needed.
        // For now, let's assume we fetch all and filter in JS or join.

        return await knex('custom_proposals')
            .leftJoin('documents', 'custom_proposals.original_doc_id', 'documents.id')
            .where('documents.project', project)
            .select('custom_proposals.*');
    }

    async getProposal(id) {
        const proposal = await knex('custom_proposals').where({ id }).first();
        if (!proposal) return null;

        const lines = await knex('proposal_lines').where({ proposal_id: id }).orderBy('sort_order', 'asc');

        return {
            ...proposal,
            branding_config: proposal.branding_config ? JSON.parse(proposal.branding_config) : null,
            metadata: proposal.metadata ? JSON.parse(proposal.metadata) : null,
            lines: lines.map(l => ({
                ...l,
                extra_attributes: l.extra_attributes ? JSON.parse(l.extra_attributes) : null
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
        await knex('custom_proposals').where({ id }).delete();
    }
}

module.exports = new ProposalStudioService();
