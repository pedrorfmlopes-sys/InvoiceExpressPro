
exports.up = function (knex) {
    return knex.schema.table('catalog_collections', table => {
        table.integer('lead_time_weeks').nullable();
        table.jsonb('metadata').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.table('catalog_collections', table => {
        table.dropColumn('metadata');
        table.dropColumn('lead_time_weeks');
    });
};
