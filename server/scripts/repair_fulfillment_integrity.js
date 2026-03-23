const knex = require('../src/db/knex');

async function countInvalidFulfillments(db = knex) {
    const rows = await db('proposal_fulfillments as pf')
        .leftJoin('proposal_lines as pl', function () {
            this.on('pf.proposal_line_id', '=', 'pl.id')
                .andOn('pf.proposal_id', '=', 'pl.proposal_id');
        })
        .leftJoin('document_lines as dl', function () {
            this.on('pf.doc_line_id', '=', 'dl.id')
                .andOn('pf.document_id', '=', 'dl.document_id');
        })
        .where(function () {
            this.whereNull('pl.id').orWhereNull('dl.id');
        })
        .count({ total: '*' });

    return Number(rows[0]?.total || 0);
}

async function countOrphanDocumentLines(db = knex) {
    const rows = await db('document_lines as dl')
        .leftJoin('documents as d', 'dl.document_id', 'd.id')
        .whereNull('d.id')
        .count({ total: '*' });

    return Number(rows[0]?.total || 0);
}

async function applyRepair(db = knex) {
    return db.transaction(async trx => {
        const invalidFulfillments = await trx('proposal_fulfillments as pf')
            .leftJoin('proposal_lines as pl', function () {
                this.on('pf.proposal_line_id', '=', 'pl.id')
                    .andOn('pf.proposal_id', '=', 'pl.proposal_id');
            })
            .leftJoin('document_lines as dl', function () {
                this.on('pf.doc_line_id', '=', 'dl.id')
                    .andOn('pf.document_id', '=', 'dl.document_id');
            })
            .where(function () {
                this.whereNull('pl.id').orWhereNull('dl.id');
            })
            .pluck('pf.id');

        let removedFulfillments = 0;
        if (invalidFulfillments.length > 0) {
            removedFulfillments = await trx('proposal_fulfillments')
                .whereIn('id', invalidFulfillments)
                .del();
        }

        const orphanDocumentLineIds = await trx('document_lines as dl')
            .leftJoin('documents as d', 'dl.document_id', 'd.id')
            .whereNull('d.id')
            .pluck('dl.id');

        let removedDocumentLines = 0;
        if (orphanDocumentLineIds.length > 0) {
            removedDocumentLines = await trx('document_lines')
                .whereIn('id', orphanDocumentLineIds)
                .del();
        }

        return {
            removedFulfillments,
            removedDocumentLines
        };
    });
}

async function main() {
    const apply = process.argv.includes('--apply');
    const invalidFulfillments = await countInvalidFulfillments();
    const orphanDocumentLines = await countOrphanDocumentLines();

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        invalidFulfillments,
        orphanDocumentLines
    }, null, 2));

    if (!apply) {
        await knex.destroy();
        return;
    }

    const result = await applyRepair();
    console.log(JSON.stringify({
        mode: 'applied',
        ...result
    }, null, 2));

    await knex.destroy();
}

main().catch(async (error) => {
    console.error('[repair_fulfillment_integrity] Failed:', error);
    try {
        await knex.destroy();
    } catch (_) { }
    process.exit(1);
});
