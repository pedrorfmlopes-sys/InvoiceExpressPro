exports.up = function (knex) {
    return knex.schema.createTable('project_settings', function (table) {
        table.string('project').primary();
        table.integer('backup_retention_days').defaultTo(30);
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('project_settings');
};
