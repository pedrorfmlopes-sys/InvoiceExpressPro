/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasWorkingCopies = await knex.schema.hasTable('proposal_working_copies');
    if (!hasWorkingCopies) {
        await knex.schema.createTable('proposal_working_copies', table => {
            table.uuid('id').primary().defaultTo(knex.fn.uuid());
            table.uuid('proposal_id').notNullable().unique().references('id').inTable('custom_proposals').onDelete('CASCADE');
            table.string('project_ref');
            table.boolean('is_dirty').notNullable().defaultTo(false);
            table.timestamp('source_updated_at');
            table.json('payload').notNullable();
            table.timestamps(true, true);
        });
    }

    const hasSnapshots = await knex.schema.hasTable('proposal_snapshots');
    if (!hasSnapshots) {
        await knex.schema.createTable('proposal_snapshots', table => {
            table.uuid('id').primary().defaultTo(knex.fn.uuid());
            table.uuid('proposal_id').notNullable().references('id').inTable('custom_proposals').onDelete('CASCADE');
            table.integer('version_number').notNullable().defaultTo(1);
            table.json('snapshot').notNullable();
            table.timestamps(true, true);
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    const hasSnapshots = await knex.schema.hasTable('proposal_snapshots');
    if (hasSnapshots) {
        await knex.schema.dropTable('proposal_snapshots');
    }

    const hasWorkingCopies = await knex.schema.hasTable('proposal_working_copies');
    if (hasWorkingCopies) {
        await knex.schema.dropTable('proposal_working_copies');
    }
};
