exports.up = async function (knex) {
    // 1. Dossier Nodes
    if (!(await knex.schema.hasTable('dossier_nodes'))) {
        await knex.schema.createTable('dossier_nodes', t => {
            t.string('id').primary(); // UUID
            t.string('parent_id').nullable().index(); // Hierarchy
            t.string('name');
            t.string('code').nullable();
            t.text('description').nullable();
            t.boolean('archived').defaultTo(false).index();
            t.string('created_by');
            t.timestamps(true, true);

            // Optional: Index on name/code?
            t.index('name');
        });
    }

    // 2. Dossier Links (lateral relationships)
    if (!(await knex.schema.hasTable('dossier_links'))) {
        await knex.schema.createTable('dossier_links', t => {
            t.string('from_id').notNullable().index();
            t.string('to_id').notNullable().index();
            t.string('type').defaultTo('related');

            t.primary(['from_id', 'to_id', 'type']);

            // FKs optional but good practice if safe
            // t.foreign('from_id').references('dossier_nodes.id');
        });
    }

    // 3. Document Dossier Nodes (M:M)
    if (!(await knex.schema.hasTable('document_dossier_nodes'))) {
        await knex.schema.createTable('document_dossier_nodes', t => {
            t.string('doc_id').notNullable().index();
            t.string('node_id').notNullable().index();

            t.primary(['doc_id', 'node_id']);

            // FKs
            // t.foreign('node_id').references('dossier_nodes.id');
        });
    }
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('document_dossier_nodes')
        .dropTableIfExists('dossier_links')
        .dropTableIfExists('dossier_nodes');
};
