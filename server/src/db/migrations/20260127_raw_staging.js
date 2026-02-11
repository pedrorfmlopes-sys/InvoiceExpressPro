exports.up = async function (knex) {
    const hasRawData = await knex.schema.hasColumn('documents', 'raw_data');
    const hasBrand = await knex.schema.hasColumn('documents', 'brand');

    await knex.schema.alterTable('documents', function (t) {
        if (!hasRawData) {
            t.text('raw_data'); // JSON string of the raw extraction
        }
        if (!hasBrand) {
            t.string('brand').index(); // e.g., 'nicolazzi', 'ritmonio'
        }
    });
    console.log('[Migration] documents table updated with raw_data and brand columns');
};

exports.down = function (knex) {
    return knex.schema.alterTable('documents', function (t) {
        t.dropColumn('raw_data');
        t.dropColumn('brand');
    });
};
