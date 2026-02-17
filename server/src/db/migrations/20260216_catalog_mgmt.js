// server/src/db/migrations/20260216_catalog_mgmt.js
exports.up = function (knex) {
    return knex.schema.createTable('catalog_items', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('brand').notNullable(); // e.g., 'nicolazzi'
        table.string('sku').notNullable();   // The code from Excel
        table.string('handle').nullable();  // Specially for Nicolazzi: 'Manipulo'
        table.string('finish_group').nullable(); // e.g., 'G1', 'G2'
        table.text('description_it').nullable();
        table.text('description_en').nullable();
        table.text('description_pt').nullable();
        table.decimal('price', 14, 2).nullable();
        table.decimal('price_prev', 14, 2).nullable();
        table.string('source').defaultTo('official'); // 'official' or 'manual'
        table.jsonb('metadata').nullable(); // For any extra fields
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        table.index(['brand', 'sku']);
        table.index(['brand', 'sku', 'handle', 'finish_group']);
    }).createTable('catalog_finishes', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('brand').notNullable();
        table.string('finish_code').notNullable(); // 'CR', 'OG'
        table.string('group_code').notNullable();  // 'G1', 'G2'
        table.text('name_it').nullable();
        table.text('name_en').nullable();
        table.text('note_pt').nullable();
        table.string('technical_type').nullable();
        table.string('protection').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['brand', 'finish_code']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('catalog_finishes')
        .dropTableIfExists('catalog_items');
};
