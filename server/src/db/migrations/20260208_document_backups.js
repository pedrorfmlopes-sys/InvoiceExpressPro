exports.up = function (knex) {
    return knex.schema.createTable('document_backups', function (table) {
        table.string('id').primary(); // UUID
        table.string('project').notNullable().index();
        table.string('original_doc_id').notNullable().index();
        table.text('data_snapshot').notNullable(); // JSON of the document before overwrite
        table.string('reason'); // e.g., "Overwrite from Staging"
        table.datetime('created_at').defaultTo(knex.fn.now());
        table.datetime('expires_at').index(); // For cleanup job

        // Foreign Key (Optional, depending on delete cascade policy)
        // If doc is deleted, do we keep backup? Yes, probably safer.
        // table.foreign('original_doc_id').references('documents.id');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('document_backups');
};
