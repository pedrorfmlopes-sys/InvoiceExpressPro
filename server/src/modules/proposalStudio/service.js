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
    toFiniteNumber,
    normalizeProposalLineInput,
    normalizeStoredProposalLine,
    calculateProposalMetrics
} = require('./lineUtils');

function normalizeSyncText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function normalizeSyncSku(value) {
    return normalizeSyncText(value).replace(/\s+/g, '');
}

function normalizeProposalSupplierKey(value) {
    return normalizeSyncText(value);
}

function getProposalLineMatchDescription(line) {
    const extra = safeParseJson(line?.extra_attributes, {}) || {};
    return String(extra.original_description || line?.description || '').replace(/\r\n/g, '\n').trim();
}

function mapSyncableDocumentLine(rawLine, index) {
    const sku = String(rawLine?.sku ?? rawLine?.code ?? '').trim();
    const description = String(rawLine?.description || '').replace(/\r\n/g, '\n').trim();
    const quantity = toFiniteNumber(rawLine?.quantity ?? rawLine?.qty, 0);
    const unitPrice = toFiniteNumber(
        rawLine?.unit_price_commercial
        ?? rawLine?.unit_price_factory
        ?? rawLine?.unitPrice
        ?? rawLine?.price
        ?? rawLine?.basePrice,
        0
    );
    const total = toFiniteNumber(rawLine?.total ?? rawLine?.subtotal ?? rawLine?.lineTotal, quantity * unitPrice);

    if (!sku && !description) return null;
    if (!sku && quantity === 0 && unitPrice === 0) return null;

    return {
        id: `src-${index}`,
        sourceIndex: index,
        sku,
        description,
        quantity,
        unitPrice,
        total,
        normalizedSku: normalizeSyncSku(sku),
        normalizedDescription: normalizeSyncText(description)
    };
}

function scoreSyncMatch(proposalLine, sourceLine) {
    if (!proposalLine || !sourceLine) return 0;

    let score = 0;
    const proposalSku = normalizeSyncSku(proposalLine.sku);
    const proposalDescription = normalizeSyncText(getProposalLineMatchDescription(proposalLine));

    if (proposalSku && sourceLine.normalizedSku) {
        if (proposalSku === sourceLine.normalizedSku) score += 120;
        else if (proposalSku.includes(sourceLine.normalizedSku) || sourceLine.normalizedSku.includes(proposalSku)) score += 80;
    }

    if (proposalDescription && sourceLine.normalizedDescription) {
        if (proposalDescription === sourceLine.normalizedDescription) score += 70;
        else if (
            proposalDescription.includes(sourceLine.normalizedDescription)
            || sourceLine.normalizedDescription.includes(proposalDescription)
        ) {
            score += 45;
        } else {
            const proposalTokens = new Set(proposalDescription.split(' ').filter(Boolean));
            const sourceTokens = sourceLine.normalizedDescription.split(' ').filter(Boolean);
            const commonTokenCount = sourceTokens.filter(token => proposalTokens.has(token)).length;
            score += Math.min(commonTokenCount * 6, 36);
        }
    }

    if (proposalLine.quantity > 0 && sourceLine.quantity > 0) {
        if (Math.abs(proposalLine.quantity - sourceLine.quantity) < 0.0001) score += 12;
    }

    if (proposalLine.unit_price_commercial > 0 && sourceLine.unitPrice > 0) {
        if (Math.abs(proposalLine.unit_price_commercial - sourceLine.unitPrice) < 0.01) score += 10;
    }

    return score;
}

function getSyncFieldDiffs(proposalLine, sourceLine) {
    if (!proposalLine || !sourceLine) {
        return { sku: false, description: false, quantity: false, price: false };
    }

    return {
        sku: normalizeSyncSku(proposalLine.sku) !== normalizeSyncSku(sourceLine.sku),
        description: normalizeSyncText(getProposalLineMatchDescription(proposalLine)) !== normalizeSyncText(sourceLine.description),
        quantity: Math.abs(toFiniteNumber(proposalLine.quantity, 0) - toFiniteNumber(sourceLine.quantity, 0)) > 0.0001,
        price: Math.abs(
            toFiniteNumber(proposalLine.unit_price_commercial, 0) - toFiniteNumber(sourceLine.unitPrice, 0)
        ) > 0.01
    };
}

function buildSourceLineIndexes(sourceLines) {
    const bySku = new Map();
    const byDescription = new Map();
    const byToken = new Map();

    sourceLines.forEach((line, idx) => {
        if (line.normalizedSku) {
            if (!bySku.has(line.normalizedSku)) bySku.set(line.normalizedSku, []);
            bySku.get(line.normalizedSku).push(idx);
        }

        if (line.normalizedDescription) {
            if (!byDescription.has(line.normalizedDescription)) byDescription.set(line.normalizedDescription, []);
            byDescription.get(line.normalizedDescription).push(idx);
        }

        const tokens = [...new Set(line.normalizedDescription.split(' ').filter(token => token.length >= 3))];
        tokens.forEach(token => {
            if (!byToken.has(token)) byToken.set(token, []);
            byToken.get(token).push(idx);
        });
    });

    return { bySku, byDescription, byToken };
}

function gatherSourceSyncCandidates(proposalLine, sourceLines, indexes) {
    const candidateIndexes = new Set();
    const proposalSku = normalizeSyncSku(proposalLine.sku);
    const proposalDescription = normalizeSyncText(getProposalLineMatchDescription(proposalLine));

    if (proposalSku && indexes.bySku.has(proposalSku)) {
        indexes.bySku.get(proposalSku).forEach(index => candidateIndexes.add(index));
    }

    if (proposalDescription && indexes.byDescription.has(proposalDescription)) {
        indexes.byDescription.get(proposalDescription).forEach(index => candidateIndexes.add(index));
    }

    const tokens = [...new Set(proposalDescription.split(' ').filter(token => token.length >= 3))];
    tokens.forEach(token => {
        (indexes.byToken.get(token) || []).slice(0, 10).forEach(index => candidateIndexes.add(index));
    });

    if (candidateIndexes.size === 0) {
        return sourceLines.slice(0, Math.min(sourceLines.length, 40));
    }

    return [...candidateIndexes].slice(0, 60).map(index => sourceLines[index]);
}

function isPgClient() {
    return knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';
}

function toDbJson(value) {
    const serialized = JSON.stringify(value ?? null);
    return isPgClient() ? knex.raw('?::jsonb', [serialized]) : serialized;
}

function normalizeProposalPayload(payload) {
    if (!payload) return null;

    return {
        ...payload,
        branding_config: safeParseJson(payload.branding_config, {}) || {},
        metadata: safeParseJson(payload.metadata, {}) || {},
        lead_time_rules: safeParseJson(payload.lead_time_rules, []) || [],
        associatedDocuments: Array.isArray(payload.associatedDocuments) ? payload.associatedDocuments : [],
        lines: Array.isArray(payload.lines) ? payload.lines.map(normalizeStoredProposalLine) : []
    };
}


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

    async buildAssociatedDocuments(proposal) {
        let associatedDocuments = [];

        if (proposal.original_doc_id) {
            const originalDoc = await knex('documents').where({ id: proposal.original_doc_id }).first();
            if (originalDoc) {
                associatedDocuments.push({
                    id: originalDoc.id,
                    docNumber: originalDoc.docNumber,
                    docType: originalDoc.docType,
                    supplier: originalDoc.supplier,
                    isOriginal: true
                });
            }
        }

        const fulfillmentDocs = await buildValidFulfillmentsQuery()
            .join('documents', 'pf.document_id', 'documents.id')
            .where('pf.proposal_id', proposal.id)
            .select(
                'documents.id',
                'documents.docNumber',
                'documents.docType',
                'documents.supplier'
            )
            .distinct();

        fulfillmentDocs.forEach(doc => {
            if (!associatedDocuments.some(existing => existing.id === doc.id)) {
                associatedDocuments.push(doc);
            }
        });

        return associatedDocuments;
    }

    async buildProposalPayloadFromDatabase(id, { includeAssociatedDocuments = true } = {}) {
        const proposal = await knex('custom_proposals').where({ id }).first();
        if (!proposal) return null;

        const lines = await knex('proposal_lines').where({ proposal_id: id }).orderBy('sort_order', 'asc');
        const payload = {
            ...proposal,
            branding_config: safeParseJson(proposal.branding_config, {}),
            metadata: safeParseJson(proposal.metadata, {}),
            lead_time_rules: safeParseJson(proposal.lead_time_rules, []),
            lines: lines.map(normalizeStoredProposalLine)
        };

        if (includeAssociatedDocuments) {
            payload.associatedDocuments = await this.buildAssociatedDocuments(proposal);
        }

        return payload;
    }

    async getWorkingCopyRecord(proposalId) {
        return knex('proposal_working_copies').where({ proposal_id: proposalId }).first();
    }

    async persistWorkingCopyRecord(proposalId, payload, options = {}) {
        const officialProposal = await knex('custom_proposals').where({ id: proposalId }).first();
        if (!officialProposal) throw new Error('Proposta não encontrada');

        const normalizedPayload = normalizeProposalPayload({
            ...payload,
            id: proposalId
        });

        const existing = await this.getWorkingCopyRecord(proposalId);
        const now = new Date();
        const data = {
            project_ref: officialProposal.project_ref || null,
            is_dirty: options.dirty !== undefined ? !!options.dirty : true,
            source_updated_at: options.sourceUpdatedAt !== undefined
                ? (options.sourceUpdatedAt ? new Date(options.sourceUpdatedAt) : null)
                : (officialProposal.updated_at ? new Date(officialProposal.updated_at) : null),
            payload: toDbJson(normalizedPayload),
            updated_at: now
        };

        if (existing) {
            await knex('proposal_working_copies')
                .where({ proposal_id: proposalId })
                .update(data);
        } else {
            await knex('proposal_working_copies').insert({
                id: uuidv4(),
                proposal_id: proposalId,
                ...data,
                created_at: now
            });
        }

        return normalizedPayload;
    }

    async getWorkingCopy(proposalId) {
        const officialPayload = await this.buildProposalPayloadFromDatabase(proposalId);
        if (!officialPayload) return null;

        const existing = await this.getWorkingCopyRecord(proposalId);
        const officialUpdatedAt = officialPayload.updated_at ? new Date(officialPayload.updated_at).getTime() : 0;
        const workingUpdatedAt = existing?.source_updated_at ? new Date(existing.source_updated_at).getTime() : 0;

        if (!existing || (!existing.is_dirty && workingUpdatedAt < officialUpdatedAt)) {
            const proposal = await this.persistWorkingCopyRecord(proposalId, officialPayload, {
                dirty: false,
                sourceUpdatedAt: officialPayload.updated_at
            });
            return {
                proposal,
                dirty: false
            };
        }

        return {
            proposal: normalizeProposalPayload(safeParseJson(existing.payload, officialPayload) || officialPayload),
            dirty: !!existing.is_dirty
        };
    }

    async saveWorkingCopy(proposalId, payload) {
        const proposal = await this.persistWorkingCopyRecord(proposalId, payload, { dirty: true });
        return {
            proposal,
            dirty: true
        };
    }

    async discardWorkingCopy(proposalId) {
        await knex('proposal_working_copies').where({ proposal_id: proposalId }).delete();
        return { ok: true };
    }

    async storeProposalSnapshot(proposalId, snapshotPayload) {
        const maxRow = await knex('proposal_snapshots')
            .where({ proposal_id: proposalId })
            .max('version_number as maxVersion')
            .first();

        const nextVersion = toFiniteNumber(maxRow?.maxVersion, 0) + 1;
        const now = new Date();

        await knex('proposal_snapshots').insert({
            id: uuidv4(),
            proposal_id: proposalId,
            version_number: nextVersion,
            snapshot: toDbJson(normalizeProposalPayload(snapshotPayload)),
            created_at: now,
            updated_at: now
        });
    }

    async pruneProposalSnapshots(proposalId, keep = 6) {
        const snapshots = await knex('proposal_snapshots')
            .where({ proposal_id: proposalId })
            .orderBy('created_at', 'desc')
            .orderBy('version_number', 'desc');

        const idsToDelete = snapshots.slice(keep).map(snapshot => snapshot.id);
        if (idsToDelete.length > 0) {
            await knex('proposal_snapshots').whereIn('id', idsToDelete).delete();
        }
    }

    async getProposalVersions(proposalId) {
        return knex('proposal_snapshots')
            .where({ proposal_id: proposalId })
            .select('id', 'version_number', 'created_at', 'updated_at')
            .orderBy('created_at', 'desc')
            .orderBy('version_number', 'desc');
    }

    async commitWorkingCopy(proposalId) {
        const workingCopy = await this.getWorkingCopyRecord(proposalId);
        const officialProposal = await this.buildProposalPayloadFromDatabase(proposalId);
        if (!officialProposal) throw new Error('Proposta não encontrada');

        if (!workingCopy || !workingCopy.is_dirty) {
            await knex('proposal_working_copies').where({ proposal_id: proposalId }).delete();
            return {
                proposal: officialProposal,
                dirty: false
            };
        }

        const proposalPayload = normalizeProposalPayload(safeParseJson(workingCopy.payload, officialProposal) || officialProposal);

        await this.storeProposalSnapshot(proposalId, officialProposal);
        const savedProposal = await this.updateProposal(proposalId, proposalPayload);
        await knex('proposal_working_copies').where({ proposal_id: proposalId }).delete();
        await this.pruneProposalSnapshots(proposalId, 6);

        return {
            proposal: savedProposal,
            dirty: false
        };
    }

    async restoreProposalVersion(proposalId, snapshotId) {
        const snapshot = await knex('proposal_snapshots')
            .where({ proposal_id: proposalId, id: snapshotId })
            .first();
        if (!snapshot) throw new Error('Versão não encontrada');

        const currentProposal = await this.buildProposalPayloadFromDatabase(proposalId);
        if (!currentProposal) throw new Error('Proposta não encontrada');

        await this.storeProposalSnapshot(proposalId, currentProposal);
        const restoredPayload = normalizeProposalPayload(safeParseJson(snapshot.snapshot, null));
        const savedProposal = await this.updateProposal(proposalId, restoredPayload);
        await knex('proposal_working_copies').where({ proposal_id: proposalId }).delete();
        await this.pruneProposalSnapshots(proposalId, 6);

        return savedProposal;
    }

    async getProposalEditorData(id) {
        return this.buildProposalPayloadFromDatabase(id, { includeAssociatedDocuments: false });
    }

    async generateConsolidatedExcel(project, filters = {}) {
        const data = await this.getConsolidatedProposalsData(project, filters);
        return await ProposalExporter.generateConsolidatedItemsExcel(data);
    }

    async getProposal(id) {
        return this.buildProposalPayloadFromDatabase(id);
    }

    async updateProposal(id, data) {
        const { lines, associatedDocuments, ...header } = data;
        const currentProposal = await knex('custom_proposals').where({ id }).first();

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

        if (header.status === 'accepted') {
            await this.handleAcceptedStatus(id);
        }

        return this.getProposal(id);
    }

    async deleteProposal(id) {
        await knex('proposal_lines').where({ proposal_id: id }).delete();
        await knex('custom_proposals').where({ id: id }).delete();
    }

    async patchProposal(id, data) {
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

        if (data.status === 'accepted') {
            await this.handleAcceptedStatus(id);
        }

        return this.getProposal(id);
    }

    async getSourceSyncCandidates(proposalId) {
        const workingState = await this.getWorkingCopy(proposalId);
        const proposal = workingState?.proposal;
        if (!proposal) throw new Error('Proposta não encontrada');

        const metadata = safeParseJson(proposal.metadata, {}) || {};
        const originalDoc = proposal.original_doc_id
            ? await knex('documents').where({ id: proposal.original_doc_id }).first()
            : null;

        const candidateNumbers = [...new Set([
            originalDoc?.docNumber,
            metadata?.doc_number,
            proposal.proposal_number
        ].filter(Boolean).map(value => String(value).trim()))];

        let query = knex('documents')
            .select('id', 'docNumber', 'docType', 'supplier', 'date', 'status', 'created_at', 'updated_at')
            .orderBy('updated_at', 'desc')
            .orderBy('created_at', 'desc');

        if (proposal.project_ref) {
            query = query.where('project', proposal.project_ref);
        }

        if (originalDoc?.supplier) {
            query = query.andWhere('supplier', originalDoc.supplier);
        }

        if (candidateNumbers.length > 0) {
            query = query.andWhere(function () {
                candidateNumbers.forEach((docNumber, index) => {
                    if (index === 0) this.where('docNumber', docNumber);
                    else this.orWhere('docNumber', docNumber);
                });
            });
        } else if (proposal.original_doc_id) {
            query = query.where('id', proposal.original_doc_id);
        } else {
            return [];
        }

        const docs = await query;
        const seen = new Set();
        return docs
            .filter(doc => {
                if (seen.has(doc.id)) return false;
                seen.add(doc.id);
                return true;
            })
            .map(doc => ({
                id: doc.id,
                docNumber: doc.docNumber,
                docType: doc.docType,
                supplier: doc.supplier,
                date: doc.date,
                status: doc.status,
                isOriginal: doc.id === proposal.original_doc_id
            }));
    }

    async getSourceSyncPreview(proposalId, sourceDocId = null) {
        const workingState = await this.getWorkingCopy(proposalId);
        const proposal = workingState?.proposal;
        if (!proposal) throw new Error('Proposta não encontrada');

        const candidates = await this.getSourceSyncCandidates(proposalId);
        if (candidates.length === 0) {
            return {
                proposalId,
                sourceDocId: null,
                sourceDocument: null,
                candidates: [],
                matches: [],
                sourceLines: []
            };
        }

        const selectedCandidate = (
            candidates.find(doc => doc.id === sourceDocId)
            || candidates.find(doc => !doc.isOriginal)
            || candidates[0]
        );

        const sourceDoc = await knex('documents').where({ id: selectedCandidate.id }).first();
        if (!sourceDoc) throw new Error('Documento-fonte não encontrado');

        let sourceData = null;
        const satelliteTables = ['nicolazzi_proformas', 'nicolazzi_invoices'];
        for (const table of satelliteTables) {
            sourceData = await SatelliteStorage.getData(table, sourceDoc.id);
            if (sourceData) break;
        }
        sourceData = sourceData || safeParseJson(sourceDoc.rawJson, {}) || {};

        const sourceLines = (sourceData.lines || [])
            .map((line, index) => mapSyncableDocumentLine(line, index))
            .filter(Boolean);

        const proposalLines = (proposal.lines || [])
            .map(normalizeStoredProposalLine)
            .filter(line => line.line_type !== 'comment');

        const sourceIndexes = buildSourceLineIndexes(sourceLines);

        const matches = proposalLines.map((proposalLine, proposalIndex) => {
            const candidateSourceLines = gatherSourceSyncCandidates(proposalLine, sourceLines, sourceIndexes);
            const scoredSuggestions = candidateSourceLines
                .map(sourceLine => ({
                    sourceIndex: sourceLine.sourceIndex,
                    score: scoreSyncMatch(proposalLine, sourceLine),
                    sourceLine
                }))
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);

            const suggested = scoredSuggestions[0]?.sourceLine || null;
            const fieldDiffs = getSyncFieldDiffs(proposalLine, suggested);

            return {
                proposalLineId: proposalLine.id,
                proposalIndex,
                proposalLine: {
                    id: proposalLine.id,
                    sku: proposalLine.sku,
                    description: proposalLine.description,
                    originalDescription: getProposalLineMatchDescription(proposalLine),
                    quantity: proposalLine.quantity,
                    unitPrice: proposalLine.unit_price_commercial
                },
                suggestedSourceIndex: suggested ? suggested.sourceIndex : null,
                suggestedScore: scoredSuggestions[0]?.score || 0,
                fieldDiffs,
                hasChanges: Object.values(fieldDiffs).some(Boolean),
                suggestions: scoredSuggestions.map(entry => ({
                    sourceIndex: entry.sourceIndex,
                    score: entry.score,
                    sku: entry.sourceLine.sku,
                    description: entry.sourceLine.description,
                    quantity: entry.sourceLine.quantity,
                    unitPrice: entry.sourceLine.unitPrice
                }))
            };
        });

        return {
            proposalId,
            sourceDocId: sourceDoc.id,
            sourceDocument: {
                id: sourceDoc.id,
                docNumber: sourceDoc.docNumber,
                docType: sourceDoc.docType,
                supplier: sourceDoc.supplier,
                date: sourceDoc.date,
                status: sourceDoc.status
            },
            candidates,
            sourceLines: sourceLines.map(line => ({
                sourceIndex: line.sourceIndex,
                sku: line.sku,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                total: line.total
            })),
            matches
        };
    }

    async applySourceSync(proposalId, payload = {}) {
        const { sourceDocId, updates = [] } = payload || {};
        if (!sourceDocId) throw new Error('sourceDocId é obrigatório');

        const workingState = await this.getWorkingCopy(proposalId);
        const proposal = workingState?.proposal;
        if (!proposal) throw new Error('Proposta não encontrada');

        const sourceDoc = await knex('documents').where({ id: sourceDocId }).first();
        if (!sourceDoc) throw new Error('Documento-fonte não encontrado');

        let sourceData = null;
        const satelliteTables = ['nicolazzi_proformas', 'nicolazzi_invoices'];
        for (const table of satelliteTables) {
            sourceData = await SatelliteStorage.getData(table, sourceDoc.id);
            if (sourceData) break;
        }
        sourceData = sourceData || safeParseJson(sourceDoc.rawJson, {}) || {};

        const sourceLines = (sourceData.lines || [])
            .map((line, index) => mapSyncableDocumentLine(line, index))
            .filter(Boolean);
        const sourceByIndex = Object.fromEntries(sourceLines.map(line => [String(line.sourceIndex), line]));

        const currentLines = (proposal.lines || []).map(normalizeStoredProposalLine);
        const currentById = Object.fromEntries(currentLines.map(line => [line.id, line]));

        const validUpdates = updates.filter(update =>
            update?.proposalLineId
            && update?.sourceIndex !== undefined
            && sourceByIndex[String(update.sourceIndex)]
            && currentById[update.proposalLineId]
            && currentById[update.proposalLineId].line_type !== 'comment'
        );

        const proposalBrand = proposal.brand_id || 'other';
        const appliedLineIds = [];

        const nextLines = currentLines.map(line => ({ ...line }));

        for (const update of validUpdates) {
            const currentLine = currentById[update.proposalLineId];
            const sourceLine = sourceByIndex[String(update.sourceIndex)];
            const fields = {
                sku: !!update.fields?.sku,
                description: !!update.fields?.description,
                quantity: !!update.fields?.quantity,
                price: !!update.fields?.price
            };

            const nextExtra = {
                ...(currentLine.extra_attributes || {}),
                source_sync: {
                    source_doc_id: sourceDoc.id,
                    source_doc_number: sourceDoc.docNumber,
                    source_index: sourceLine.sourceIndex,
                    synced_at: new Date().toISOString(),
                    fields
                }
            };

            if (fields.description && sourceLine.description) {
                nextExtra.original_description = sourceLine.description;
            }

            const nextLine = {
                ...currentLine,
                sku: fields.sku && sourceLine.sku ? sourceLine.sku : currentLine.sku,
                description: fields.description && sourceLine.description ? sourceLine.description : currentLine.description,
                quantity: fields.quantity ? sourceLine.quantity : currentLine.quantity,
                unit_price_factory: fields.price ? sourceLine.unitPrice : currentLine.unit_price_factory,
                unit_price_commercial: fields.price ? sourceLine.unitPrice : currentLine.unit_price_commercial,
                extra_attributes: nextExtra
            };

            const lineData = normalizeProposalLineInput(nextLine, {
                proposalId,
                sortOrder: currentLine.sort_order,
                defaultItemQuantity: 0,
                defaultVatRate: currentLine.vat_rate || '23'
            });

            if (fields.sku && sourceLine.sku && normalizeSyncSku(sourceLine.sku) !== normalizeSyncSku(currentLine.sku)) {
                await this.enrichLineWithCatalog(proposalBrand, lineData);
            }

            const targetIndex = nextLines.findIndex(line => line.id === currentLine.id);
            if (targetIndex >= 0) {
                nextLines[targetIndex] = normalizeStoredProposalLine({
                    ...nextLines[targetIndex],
                    ...lineData,
                    id: currentLine.id
                });
            }

            appliedLineIds.push(currentLine.id);
        }

        const currentMetadata = safeParseJson(proposal.metadata, {}) || {};
        currentMetadata.last_source_sync = {
            source_doc_id: sourceDoc.id,
            source_doc_number: sourceDoc.docNumber,
            synced_at: new Date().toISOString(),
            updated_lines: appliedLineIds.length
        };

        const workingCopy = await this.saveWorkingCopy(proposalId, {
            ...proposal,
            metadata: currentMetadata,
            lines: nextLines
        });

        return {
            ok: true,
            appliedCount: appliedLineIds.length,
            proposal: workingCopy.proposal
        };
    }

    async handleAcceptedStatus(proposalId) {
        const proposal = await knex('custom_proposals as cp')
            .leftJoin('documents as d', 'cp.original_doc_id', 'd.id')
            .select('cp.id', 'cp.project_ref', 'cp.brand_id', 'cp.proposal_number', 'd.supplier as source_supplier')
            .where('cp.id', proposalId)
            .first();
        if (!proposal) return;

        const acceptedProposalNumber = String(proposal.proposal_number || '').trim();
        const acceptedSupplierKey = normalizeProposalSupplierKey(proposal.source_supplier || proposal.brand_id);
        if (!proposal.project_ref || !acceptedProposalNumber || !acceptedSupplierKey) return;

        const siblings = await knex('custom_proposals as cp')
            .leftJoin('documents as d', 'cp.original_doc_id', 'd.id')
            .select('cp.id', 'cp.brand_id', 'd.supplier as source_supplier')
            .where('cp.project_ref', proposal.project_ref)
            .where('cp.proposal_number', acceptedProposalNumber)
            .whereIn('cp.status', ['draft', 'sent'])
            .whereNot('cp.id', proposalId);

        const siblingIds = siblings
            .filter(sibling => normalizeProposalSupplierKey(sibling.source_supplier || sibling.brand_id) === acceptedSupplierKey)
            .map(sibling => sibling.id);

        if (siblingIds.length > 0) {
            await knex('custom_proposals')
                .whereIn('id', siblingIds)
                .update({
                    status: 'closed_other',
                    updated_at: new Date()
                });
        }
        return;

        const proposalNumber = String(proposal.proposal_number || '').trim();
        const supplierKey = normalizeProposalSupplierKey(proposal.source_supplier || proposal.brand_id);
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
