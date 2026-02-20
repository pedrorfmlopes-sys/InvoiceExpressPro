
exports.up = function (knex) {
    return knex.schema
        // 1. Document Lines (Exploded Invoice Lines for SQL querying)
        .createTable('document_lines', function (t) {
            t.uuid('id').primary().defaultTo(knex.fn.uuid());
            t.string('document_id').index(); // Link to 'documents.id' (String)
            t.string('sku').index();
            t.text('description');
            t.decimal('quantity', 14, 4).defaultTo(0);
            t.decimal('unit_price', 14, 4).defaultTo(0);
            t.decimal('total', 14, 4).defaultTo(0);
            t.json('metadata'); // To store specific extraction data like 'line_shipping_mark' if needed
            t.timestamps(true, true);
        })
        // 2. Proposal Fulfillments (The Link)
        .createTable('proposal_fulfillments', function (t) {
            t.uuid('id').primary().defaultTo(knex.fn.uuid());
            t.uuid('proposal_line_id').index(); // Link to 'proposal_lines.id' (UUID)
            t.uuid('doc_line_id').index();      // Link to 'document_lines.id' (UUID)

            // Creating a direct link to header as well for faster queries/indexing
            // (Optional but useful for "Show me all invoices for this proposal")
            t.uuid('proposal_id').index();
            t.string('document_id').index();

            t.decimal('quantity_fulfilled', 14, 4).notNullable();
            t.timestamps(true, true);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('proposal_fulfillments')
        .dropTableIfExists('document_lines');
};
