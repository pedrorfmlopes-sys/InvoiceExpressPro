exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('dossier_node_labels'))) {
        await knex.schema.createTable('dossier_node_labels', (table) => {
            table.uuid('id').primary();
            table.string('node_id').references('id').inTable('dossier_nodes').onDelete('CASCADE');
            table.string('label_id').references('id').inTable('labels').onDelete('CASCADE');
            table.timestamp('created_at').defaultTo(knex.fn.now());

            table.unique(['node_id', 'label_id']);
            table.index('node_id');
        });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('dossier_node_labels');
};
