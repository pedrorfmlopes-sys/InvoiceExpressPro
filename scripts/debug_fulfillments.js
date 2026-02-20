const knex = require('../server/src/db/knex');

async function debugFulfillments() {
    console.log('--- DIAGNOSTIC: FULFILLMENTS ---');

    // Get all fulfillments with details
    const fulfillments = await knex('proposal_fulfillments as pf')
        .join('proposal_lines as pl', 'pf.proposal_line_id', 'pl.id')
        .join('document_lines as dl', 'pf.doc_line_id', 'dl.id')
        .join('custom_proposals as p', 'pf.proposal_id', 'p.id')
        .join('documents as d', 'pf.document_id', 'd.id')
        .select(
            'p.name as proposal_name',
            'd.docNumber as invoice_num',
            'pl.sku',
            'pl.description',
            'pl.quantity as proposal_qty',
            'pf.quantity_fulfilled as invoiced_qty'
        );

    if (fulfillments.length === 0) {
        console.log('NO FULFILLMENTS FOUND. (Did you click the button?)');
    } else {
        console.log(`Found ${fulfillments.length} fulfilled lines:`);
        console.table(fulfillments);
    }
    console.log('--------------------------------');
    process.exit();
}

debugFulfillments();
