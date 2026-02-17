exports.up = function (knex) {
    return knex.schema.table('catalog_items', table => {
        table.string('series').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.table('catalog_items', table => {
        table.dropColumn('series');
    });
};
