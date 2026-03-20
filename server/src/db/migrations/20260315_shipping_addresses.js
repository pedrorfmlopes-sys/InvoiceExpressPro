exports.up = async function (knex) {
    const hasTable = await knex.schema.hasTable('shipping_addresses');
    if (!hasTable) {
        return knex.schema.createTable('shipping_addresses', table => {
            table.string('id').primary();
            table.string('name').notNullable();
            table.text('address').notNullable();
            table.string('project').notNullable().defaultTo('default');
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        });
    }
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('shipping_addresses');
};
