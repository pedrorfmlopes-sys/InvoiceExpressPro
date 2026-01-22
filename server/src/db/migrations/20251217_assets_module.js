exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('assets'))) {
        await knex.schema.createTable('assets', t => {
            t.string('id').primary(); // UUID
            t.string('kind').index(); // e.g., 'icon'
            t.string('mime_type');
            t.string('ext');
            t.integer('size_bytes');
            t.string('sha256').index(); // Deduplication
            t.string('original_filename');
            t.string('storage_driver').defaultTo('local');
            t.string('storage_path'); // relative to data/assets
            t.string('created_by').nullable();
            t.timestamps(true, true);
        });
    }
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('assets');
};
