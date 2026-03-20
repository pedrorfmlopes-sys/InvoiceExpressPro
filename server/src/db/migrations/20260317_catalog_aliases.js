exports.up = async function(knex) {
    if (!(await knex.schema.hasTable('catalog_aliases'))) {
        await knex.schema.createTable('catalog_aliases', (table) => {
            table.string('id').primary();
            table.string('brand').notNullable(); // NICOLAZZI, AXA, etc.
            table.string('original_sku').notNullable(); // What comes from the PDF/Excel
            table.string('corrected_sku').notNullable(); // The right mapped SKU
            table.timestamp('created_at').defaultTo(knex.fn.now());
            
            // Ensures we don't map the same wrong SKU twice for the same brand
            table.unique(['brand', 'original_sku']);
        });
    }
};

exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('catalog_aliases');
};
