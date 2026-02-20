
exports.up = function (knex) {
    return knex.schema
        // 1. Add Logistics Fields to Proposals
        .table('custom_proposals', function (t) {
            t.dateTime('order_confirmation_date').nullable(); // Data em que a fábrica aceitou
            t.integer('general_lead_time_weeks').defaultTo(8); // Tempo padrão (ex: 8 semanas)
            t.text('logistics_notes').nullable(); // Notas gerais de logística
        })

        // 2. Add Logistics Fields to Proposal Lines
        .table('proposal_lines', function (t) {
            t.integer('lead_time_weeks').nullable(); // Específico da linha (sobrepõe o geral)
            t.dateTime('predicted_ship_date').nullable(); // Data calculada de saída
            t.boolean('is_manual_override').defaultTo(false); // Se a data foi forçada manualmente
            t.string('production_category').nullable(); // 'finishings', 'rough_parts', etc.
            t.text('production_notes').nullable(); // Notas específicas (ex: "Atraso no latão")
        })

        // 3. Factory Calendars (For Holiday/Shutdown Management)
        .createTable('factory_calendars', function (t) {
            t.uuid('id').primary(); // Manual UUID or default
            t.string('name').notNullable(); // e.g. "Nicolazzi Italy"
            t.string('brand_id').index(); // e.g. "nicolazzi"
            t.string('country_code').defaultTo('IT');
            t.timestamps(true, true);
        })

        // 4. Calendar Events (Holidays & Shutdowns)
        .createTable('calendar_events', function (t) {
            t.uuid('id').primary();
            t.uuid('calendar_id').index().references('id').inTable('factory_calendars').onDelete('CASCADE');
            t.string('type').notNullable(); // 'holiday', 'shutdown', 'manual'
            t.date('start_date').notNullable();
            t.date('end_date').notNullable(); // Same as start for 1 day events
            t.string('description');
            t.boolean('is_recurring').defaultTo(true); // If true, repeats every year (e.g. Christmas, Ferragosto)
            t.timestamps(true, true);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('calendar_events')
        .dropTableIfExists('factory_calendars')
        .table('proposal_lines', function (t) {
            t.dropColumn('production_notes');
            t.dropColumn('production_category');
            t.dropColumn('is_manual_override');
            t.dropColumn('predicted_ship_date');
            t.dropColumn('lead_time_weeks');
        })
        .table('custom_proposals', function (t) {
            t.dropColumn('logistics_notes');
            t.dropColumn('general_lead_time_weeks');
            t.dropColumn('order_confirmation_date');
        });
};
