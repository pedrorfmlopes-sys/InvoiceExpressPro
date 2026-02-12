exports.up = function (knex) {
    return knex.schema
        .createTable('reading_profiles', function (table) {
            table.uuid('id').primary();
            table.string('name').notNullable();
            table.string('doc_type').defaultTo('invoice'); // invoice, receipt, etc.
            table.integer('priority').defaultTo(1); // 10=specific, 5=type, 1=generic
            table.boolean('active').defaultTo(true);
            table.string('created_by');
            table.timestamps(true, true);
        })
        .createTable('reading_profile_fields', function (table) {
            table.increments('id');
            table.uuid('profile_id').references('id').inTable('reading_profiles').onDelete('CASCADE');
            table.string('field_key').notNullable(); // docNumber, date, etc.
            table.string('method').defaultTo('region'); // region, keyword_anchor, regex
            table.integer('page').defaultTo(1);
            table.json('rect'); // {x, y, w, h} normalized 0..1
            table.string('regex'); // optional regex string
            table.boolean('enabled').defaultTo(true);
            table.timestamps(true, true);
        })
        .createTable('reading_profile_signatures', function (table) {
            table.increments('id');
            table.uuid('profile_id').references('id').inTable('reading_profiles').onDelete('CASCADE');
            table.string('keyword').notNullable();
            table.integer('weight').defaultTo(1);
        })
        .createTable('document_extraction_meta', function (table) {
            table.increments('id');
            table.string('doc_id').references('id').inTable('documents').onDelete('CASCADE').unique(); // One meta per doc
            table.uuid('profile_id').references('id').inTable('reading_profiles').onDelete('SET NULL');
            table.float('confidence');
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('document_extraction_meta')
        .dropTableIfExists('reading_profile_signatures')
        .dropTableIfExists('reading_profile_fields')
        .dropTableIfExists('reading_profiles');
};
