/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('proposal_presets', table => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid());
        table.string('project').notNullable().index();
        table.string('name').notNullable();
        table.string('category').notNullable().index(); // warranty, notes, payment
        table.text('content').notNullable();
        table.boolean('is_global').defaultTo(false);
        table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('proposal_presets');
};
