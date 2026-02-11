exports.up = function (knex) {
    return knex.schema.createTable('extraction_batches', table => {
        table.string('id').primary();
        table.string('project').notNullable();
        table.integer('total_files').defaultTo(0);
        table.integer('done_files').defaultTo(0);
        table.integer('error_files').defaultTo(0);
        table.string('status').defaultTo('processing');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('extraction_batches');
};
