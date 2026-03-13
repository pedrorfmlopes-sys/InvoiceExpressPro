/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.up = function (knex) {
    return knex.schema.hasTable('catalog_aliases').then(function (exists) {
        if (!exists) {
            return knex.schema.createTable('catalog_aliases', function (table) {
                table.uuid('id').primary().defaultTo(knex.fn.uuid());

                table.string('brand').notNullable();
                table.string('original_sku').notNullable();
                table.string('corrected_sku').notNullable();
                table.datetime('created_at').defaultTo(knex.fn.now());

                // Ensure we don't learn multiple different corrections for the same exact raw SKU within a brand
                table.unique(['brand', 'original_sku']);
            });
        }
    });
};

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('catalog_aliases');
};
