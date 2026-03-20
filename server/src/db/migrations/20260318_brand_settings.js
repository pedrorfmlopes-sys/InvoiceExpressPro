// server/src/db/migrations/20260318_brand_settings.js
exports.up = function (knex) {
    return knex.schema.createTable('brand_settings', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('brand_id').notNullable().unique();
        table.string('packaging_cost_type').defaultTo('percent'); // 'percent' | 'fixed'
        table.decimal('packaging_cost_value', 14, 4).defaultTo(0);
        table.string('packaging_cost_base').defaultTo('liquid'); // 'liquid' | 'before_shipping'
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    }).then(() => {
        // Pre-populate Scarabeo default (3% liquid)
        return knex('brand_settings').insert({
            id: '550e8400-e29b-41d4-a716-446655440000', // Static UUID for seed
            brand_id: 'scarabeo',
            packaging_cost_type: 'percent',
            packaging_cost_value: 0.03,
            packaging_cost_base: 'liquid'
        });
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('brand_settings');
};
