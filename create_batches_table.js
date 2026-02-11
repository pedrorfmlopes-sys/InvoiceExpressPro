const knex = require('./server/src/db/knex');

async function up() {
    try {
        const exists = await knex.schema.hasTable('extraction_batches');
        if (exists) {
            console.log('Table extraction_batches already exists.');
            process.exit(0);
        }

        await knex.schema.createTable('extraction_batches', table => {
            table.string('id').primary();
            table.string('project').notNullable();
            table.integer('total_files').defaultTo(0);
            table.integer('done_files').defaultTo(0);
            table.integer('error_files').defaultTo(0);
            table.string('status').defaultTo('processing');
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        });

        console.log('Table extraction_batches created successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Failed to create table:', e);
        process.exit(1);
    }
}

up();
