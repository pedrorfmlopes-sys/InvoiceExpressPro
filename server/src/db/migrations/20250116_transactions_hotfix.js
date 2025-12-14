exports.up = async function (knex) {
    const hasTrans = await knex.schema.hasTable('transactions');
    if (!hasTrans) {
        await knex.schema.createTable('transactions', function (table) {
            table.string('id').primary();
            table.string('project').notNullable().defaultTo('default');
            table.string('orgId').notNullable().defaultTo('default'); // Legacy compat
            table.string('title').notNullable();
            table.string('status').notNullable().defaultTo('open');
            table.string('customer_name').nullable();
            table.string('supplier_name').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        });
    } else {
        // Check key columns
        const cols = ['customer_name', 'supplier_name', 'orgId', 'project', 'status', 'title'];
        for (const col of cols) {
            const hasCol = await knex.schema.hasColumn('transactions', col);
            if (!hasCol) {
                await knex.schema.alterTable('transactions', t => {
                    if (col === 'orgId' || col === 'project') t.string(col).notNullable().defaultTo('default');
                    else if (col === 'status') t.string(col).notNullable().defaultTo('open');
                    else if (col === 'title') t.string(col).notNullable().defaultTo('Untitled');
                    else t.string(col).nullable();
                });
            }
        }
    }

    const hasDocs = await knex.schema.hasTable('transaction_docs');
    if (!hasDocs) {
        await knex.schema.createTable('transaction_docs', function (table) {
            table.string('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
            table.string('doc_id').references('id').inTable('documents').onDelete('CASCADE');
            table.string('role').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.primary(['transaction_id', 'doc_id']);
        });
    }
};

exports.down = function (knex) {
    // Safe down: do nothing or drop? Usually hotfixes shouldn't destroy data lightly.
    // user request didn't specify strict down, but standard is revert.
    // returning Promise.resolve() to be safe against accidental data loss.
    return Promise.resolve();
};
