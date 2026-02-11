exports.up = async function (knex) {
    const hasTable = await knex.schema.hasTable('customers');
    if (!hasTable) {
        await knex.schema.createTable('customers', function (table) {
            table.string('id').primary();
            table.string('vat').notNullable().unique(); // Normalized VAT (e.g. PT123456789)
            table.string('name').notNullable();
            table.text('address').nullable();
            table.string('email').nullable();
            table.string('phone').nullable();
            table.string('project').notNullable().defaultTo('default'); // Project scoping
            table.json('metadata').nullable(); // For extra fields (IDs in other systems, etc)
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());

            table.index(['vat'], 'idx_customer_vat');
            table.index(['name'], 'idx_customer_name');
            table.index(['project'], 'idx_customer_project');
        });
    }
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('customers');
};
