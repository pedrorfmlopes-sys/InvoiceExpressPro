// Env - MUST BE FIRST
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
process.env.JWT_SECRET = 'test_secret';
process.env.AUTH_MODE = 'optional';

const knex = require('../server/src/db/knex');

async function repair() {
    console.log('Repairing Transactions Schema...');
    try {
        const hasTable = await knex.schema.hasTable('transactions');
        if (!hasTable) {
            console.log('Creating missing table transactions...');
            await knex.schema.createTable('transactions', function (table) {
                table.string('id').primary();
                table.string('project').notNullable().defaultTo('default');
                table.string('title').nullable();
                table.string('status').defaultTo('open');
                table.string('customer_name').nullable();
                table.string('supplier_name').nullable();
                table.timestamp('created_at').defaultTo(knex.fn.now());
                table.timestamp('updated_at').defaultTo(knex.fn.now());
            });
        } else {
            // Check columns
            const hasCustomer = await knex.schema.hasColumn('transactions', 'customer_name');
            if (!hasCustomer) {
                console.log('Adding column customer_name...');
                await knex.schema.table('transactions', t => t.string('customer_name').nullable());
            }
            const hasSupplier = await knex.schema.hasColumn('transactions', 'supplier_name');
            if (!hasSupplier) {
                console.log('Adding column supplier_name...');
                await knex.schema.table('transactions', t => t.string('supplier_name').nullable());
            }
        }

        const hasDocs = await knex.schema.hasTable('transaction_docs');
        if (!hasDocs) {
            console.log('Creating missing table transaction_docs...');
            await knex.schema.createTable('transaction_docs', function (table) {
                table.string('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
                table.string('doc_id').references('id').inTable('documents').onDelete('CASCADE');
                table.string('role').nullable();
                table.timestamp('created_at').defaultTo(knex.fn.now());
                table.primary(['transaction_id', 'doc_id']);
            });
        }

        console.log('Repair Complete.');
    } catch (e) {
        console.error('Repair failed:', e);
    } finally {
        knex.destroy();
    }
}

repair();
