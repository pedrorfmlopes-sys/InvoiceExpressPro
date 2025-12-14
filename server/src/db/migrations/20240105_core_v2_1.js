exports.up = function (knex) {
    return knex.schema
        .table('documents', function (table) {
            // Add JSON column for references (e.g. [{type: 'PO', value: '123'}])
            // Using text for compatibility with SQLite/PG generic handling if json not strictly supported by knex version
            table.text('references_json');
            // Ensure customer column exists (it might from initial schema, but enabling strict check)
            // table.string('customer'); // Already exists in base schema usually, skipping to avoid error
        })
        .createTable('doc_links', function (table) {
            table.uuid('id').primary();
            table.string('project').notNullable().defaultTo('default'); // Scoping
            table.uuid('from_id').notNullable(); // Document ID
            table.uuid('to_id').notNullable();   // Document ID or Transaction ID
            table.string('type').defaultTo('related'); // related, invoice-receipt, po-invoice
            table.timestamp('created_at').defaultTo(knex.fn.now());

            table.index(['project', 'from_id']);
            table.index(['project', 'to_id']);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTable('doc_links')
        .table('documents', function (table) {
            table.dropColumn('references_json');
        });
};
