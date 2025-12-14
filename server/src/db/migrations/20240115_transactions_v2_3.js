exports.up = async function (knex) {
    // 1. Transactions Table
    const hasTrans = await knex.schema.hasTable('transactions');
    if (!hasTrans) {
        await knex.schema.createTable('transactions', function (table) {
            table.string('id').primary();
            table.string('project').notNullable().defaultTo('default');
            table.string('orgId').notNullable().defaultTo('default'); // Legacy/V2.3
            table.string('title').nullable();
            table.string('status').defaultTo('open');
            table.string('customer_name').nullable();
            table.string('supplier_name').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        });
    } else {
        // Check columns and add if missing
        const cols = [
            { name: 'project', type: 'string', default: 'default' },
            { name: 'orgId', type: 'string', default: 'default' },
            { name: 'title', type: 'string' },
            { name: 'status', type: 'string', default: 'open' },
            { name: 'customer_name', type: 'string' },
            { name: 'supplier_name', type: 'string' }
        ];

        for (const col of cols) {
            const hasCol = await knex.schema.hasColumn('transactions', col.name);
            if (!hasCol) {
                await knex.schema.alterTable('transactions', t => {
                    let b = t[col.type](col.name);
                    if (col.name === 'title') b.nullable();
                    else if (col.default) b.defaultTo(col.default);
                    else b.nullable();
                });
            }
        }
    }

    // 2. Transaction Docs Table
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
    // Non-destructive down for this hotfix context, or strictly revert?
    // Given we are fixing a broken migration file that might run on existing DBs, 
    // 'down' typically drops tables. But if it was an upgrade, dropping might be bad.
    // Standard practice: down undoes up.
    // BUT: user request implies we are fixing the "up" reliability.
    /*
    return knex.schema
      .dropTableIfExists('transaction_docs')
      .dropTableIfExists('transactions');
    */
    return Promise.resolve();
};
