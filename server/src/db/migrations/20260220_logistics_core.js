
exports.up = async function (knex) {
    // 1. Add Logistics Fields to Proposals
    if (await knex.schema.hasTable('custom_proposals')) {
        const hasCols = await knex.schema.hasColumn('custom_proposals', 'order_confirmation_date');
        if (!hasCols) {
            await knex.schema.table('custom_proposals', function (t) {
                t.dateTime('order_confirmation_date').nullable();
                t.integer('general_lead_time_weeks').defaultTo(8);
                t.text('logistics_notes').nullable();
            });
        }
    }

    // 2. Add Logistics Fields to Proposal Lines
    if (await knex.schema.hasTable('proposal_lines')) {
        const hasLeadTime = await knex.schema.hasColumn('proposal_lines', 'lead_time_weeks');
        if (!hasLeadTime) {
            await knex.schema.table('proposal_lines', function (t) {
                t.integer('lead_time_weeks').nullable();
                t.dateTime('predicted_ship_date').nullable();
                t.boolean('is_manual_override').defaultTo(false);
                t.string('production_category').nullable();
                t.text('production_notes').nullable();
            });
        }
    }

    // 3. Factory Calendars
    if (!(await knex.schema.hasTable('factory_calendars'))) {
        await knex.schema.createTable('factory_calendars', function (t) {
            t.uuid('id').primary();
            t.string('name').notNullable();
            t.string('brand_id').index();
            t.string('country_code').defaultTo('IT');
            t.timestamps(true, true);
        });
    }

    // 4. Calendar Events
    if (!(await knex.schema.hasTable('calendar_events'))) {
        await knex.schema.createTable('calendar_events', function (t) {
            t.uuid('id').primary();
            t.uuid('calendar_id').index().references('id').inTable('factory_calendars').onDelete('CASCADE');
            t.string('type').notNullable();
            t.date('start_date').notNullable();
            t.date('end_date').notNullable();
            t.string('description');
            t.boolean('is_recurring').defaultTo(true);
            t.timestamps(true, true);
        });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('calendar_events');
    await knex.schema.dropTableIfExists('factory_calendars');
    if (await knex.schema.hasTable('proposal_lines')) {
        const hasCol = await knex.schema.hasColumn('proposal_lines', 'lead_time_weeks');
        if (hasCol) {
            await knex.schema.table('proposal_lines', t => {
                t.dropColumn('production_notes');
                t.dropColumn('production_category');
                t.dropColumn('is_manual_override');
                t.dropColumn('predicted_ship_date');
                t.dropColumn('lead_time_weeks');
            });
        }
    }
    if (await knex.schema.hasTable('custom_proposals')) {
        const hasCol = await knex.schema.hasColumn('custom_proposals', 'order_confirmation_date');
        if (hasCol) {
            await knex.schema.table('custom_proposals', t => {
                t.dropColumn('logistics_notes');
                t.dropColumn('general_lead_time_weeks');
                t.dropColumn('order_confirmation_date');
            });
        }
    }
};
