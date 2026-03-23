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
        .distinct('pf.document_id')
        .select('pf.document_id');
}

async function getValidFulfillmentStatsByProposalIds(proposalIds, db = knex) {
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) return [];

    return buildValidFulfillmentsQuery(db)
        .whereIn('pf.proposal_id', proposalIds)
        .groupBy('pf.proposal_id')
        .select('pf.proposal_id', db.raw('SUM(pf.quantity_fulfilled) as total_fulfilled'));
}

function buildValidFulfilledByProposalLineQuery(db = knex) {
    return buildValidFulfillmentsQuery(db)
        .clone()
        .groupBy('pf.proposal_line_id')
        .select('pf.proposal_line_id', db.raw('SUM(pf.quantity_fulfilled) as fulfilled'));
}

module.exports = {
    buildValidFulfillmentsQuery,
    buildValidFulfilledByProposalLineQuery,
    getValidLinkedDocumentIdsQuery,
    getValidFulfillmentStatsByProposalIds
};
