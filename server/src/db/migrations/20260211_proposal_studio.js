/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('custom_proposals', table => {
            table.uuid('id').primary().defaultTo(knex.fn.uuid());
            table.string('name').notNullable();
            table.string('brand_id').notNullable();
            table.string('client_ref');
            table.string('project_ref');
            table.string('status').defaultTo('draft'); // draft, sent, accepted, rejected
            table.json('branding_config'); // { logo, colors, footer_text }
            table.json('metadata'); // Any extra fields
            table.string('original_doc_id').references('id').inTable('documents').onDelete('SET NULL');
            table.timestamps(true, true);
        })
        .createTable('proposal_lines', table => {
            table.uuid('id').primary().defaultTo(knex.fn.uuid());
            table.uuid('proposal_id').notNullable().references('id').inTable('custom_proposals').onDelete('CASCADE');
            table.string('sku');
            table.text('description');
            table.decimal('quantity', 14, 4).defaultTo(1);
            table.decimal('unit_price_factory', 14, 4).defaultTo(0);
            table.decimal('unit_price_commercial', 14, 4).defaultTo(0);
            table.string('discount_factory'); // e.g. "50+5"
            table.decimal('discount_commercial_percent', 14, 4).defaultTo(0);
            table.string('vat_rate').defaultTo('23');
            table.integer('sort_order').defaultTo(0);
            table.json('extra_attributes'); // For brand-specific data (glass type, finish, etc)
            table.timestamps(true, true);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('proposal_lines')
        .dropTableIfExists('custom_proposals');
};
