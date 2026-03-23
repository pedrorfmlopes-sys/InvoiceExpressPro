const knex = require('../../db/knex');

function buildValidFulfillmentsQuery(db = knex) {
    return db('proposal_fulfillments as pf')
        .join('proposal_lines as pl', function () {
            this.on('pf.proposal_line_id', '=', 'pl.id')
                .andOn('pf.proposal_id', '=', 'pl.proposal_id');
        })
        .join('document_lines as dl', function () {
            this.on('pf.doc_line_id', '=', 'dl.id')
                .andOn('pf.document_id', '=', 'dl.document_id');
        });
}

function getValidLinkedDocumentIdsQuery(db = knex) {
    return buildValidFulfillmentsQuery(db)
        .clone()
        .distinct('pf.document_id');
}

function buildValidFulfillmentRollupByProposalLineQuery(db = knex) {
    return buildValidFulfillmentsQuery(db)
        .clone()
        .groupBy('pf.proposal_line_id')
        .select(
            'pf.proposal_line_id',
            db.raw('SUM(COALESCE(pf.quantity_fulfilled, 0)) as raw_fulfilled'),
            db.raw('SUM(COALESCE(pf.quantity_fulfilled, 0) * COALESCE(dl.unit_price, 0)) as raw_cost_net')
        );
}

function buildEffectiveFulfillmentByProposalLineQuery(db = knex) {
    const rollup = buildValidFulfillmentRollupByProposalLineQuery(db).as('fr');
    return db('proposal_lines as pl')
        .leftJoin(rollup, 'pl.id', 'fr.proposal_line_id')
        .select(
            'pl.id as proposal_line_id',
            'pl.proposal_id',
            db.raw(`CASE
                WHEN COALESCE(fr.raw_fulfilled, 0) <= 0 THEN 0
                WHEN COALESCE(fr.raw_fulfilled, 0) >= COALESCE(pl.quantity, 0) THEN COALESCE(pl.quantity, 0)
                ELSE COALESCE(fr.raw_fulfilled, 0)
            END as fulfilled`),
            db.raw(`CASE
                WHEN COALESCE(fr.raw_fulfilled, 0) <= 0 THEN 0
                WHEN COALESCE(fr.raw_fulfilled, 0) >= COALESCE(pl.quantity, 0)
                    THEN COALESCE(fr.raw_cost_net, 0) * (COALESCE(pl.quantity, 0) / NULLIF(COALESCE(fr.raw_fulfilled, 0), 0))
                ELSE COALESCE(fr.raw_cost_net, 0)
            END as cost_net`)
        );
}

async function getValidFulfillmentStatsByProposalIds(proposalIds, db = knex) {
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) return [];

    return db
        .from(buildEffectiveFulfillmentByProposalLineQuery(db).as('ef'))
        .whereIn('ef.proposal_id', proposalIds)
        .groupBy('ef.proposal_id')
        .select('ef.proposal_id', db.raw('SUM(COALESCE(ef.fulfilled, 0)) as total_fulfilled'));
}

function buildValidFulfilledByProposalLineQuery(db = knex) {
    return buildEffectiveFulfillmentByProposalLineQuery(db)
        .clone()
        .clearSelect()
        .select('proposal_line_id', 'proposal_id', 'fulfilled');
}

module.exports = {
    buildEffectiveFulfillmentByProposalLineQuery,
    buildValidFulfillmentsQuery,
    buildValidFulfilledByProposalLineQuery,
    getValidLinkedDocumentIdsQuery,
    getValidFulfillmentStatsByProposalIds
};
