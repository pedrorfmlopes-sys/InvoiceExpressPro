exports.up = async function (knex) {
    // 1. Labels Table
    if (!(await knex.schema.hasTable('labels'))) {
        await knex.schema.createTable('labels', t => {
            t.string('id').primary(); // UUID
            t.string('project').index(); // NULL = Global
            t.string('name');
            t.string('color');
            t.string('icon_type').defaultTo('library'); // 'asset' or 'library'
            t.string('icon_value');
            t.boolean('archived').defaultTo(false);
            t.string('created_by');
            t.timestamps(true, true);

            // Index for name for faster search/dedup check
            t.index('name');
            // We do NOT add UNIQUE(project, name) to avoid SQLite NULL uniqueness issues.
            // Service layer will handle this.
        });
    }

    // 2. Document Labels Junction Table
    if (!(await knex.schema.hasTable('document_labels'))) {
        await knex.schema.createTable('document_labels', t => {
            t.string('doc_id').notNullable().index();
            t.string('label_id').notNullable().index();
            t.primary(['doc_id', 'label_id']);

            // FKs (Optional but good for integrity if docs are deleted)
            // t.foreign('doc_id').references('documents.id').onDelete('CASCADE');
            // t.foreign('label_id').references('labels.id').onDelete('CASCADE');
            // Keeping it simple for now as 'documents' table might vary in real setups, 
            // but enforcing integrity is better. User said "Independent module", but FKs imply dependency.
            // Documents table exists in Core. Labels table exists here.
            // Safe to assume 'documents' exists.
        });
    }
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('document_labels')
        .dropTableIfExists('labels');
};
