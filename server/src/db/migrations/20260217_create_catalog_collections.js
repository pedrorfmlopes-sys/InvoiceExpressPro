
exports.up = function (knex) {
    return knex.schema.createTable('catalog_collections', table => {
        table.string('brand').notNullable();
        table.string('name').notNullable(); // Collection Name
        table.boolean('is_visible').defaultTo(true);
        table.timestamps(true, true);

        table.primary(['brand', 'name']); // Composite PK
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('catalog_collections');
};
