exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('customers', 'shipping_address');
    if (!hasColumn) {
        await knex.schema.alterTable('customers', function (table) {
            table.text('shipping_address').nullable();
        });
    }
};

exports.down = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('customers', 'shipping_address');
    if (hasColumn) {
        await knex.schema.alterTable('customers', function (table) {
            table.dropColumn('shipping_address');
        });
    }
};
