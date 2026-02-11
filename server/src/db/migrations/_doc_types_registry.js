exports.up = async function (knex) {
    const exists = await knex.schema.hasTable('doc_types');
    if (exists) return;

    return knex.schema.createTable('doc_types', function (t) {
        t.increments('id').primary();
        t.string('project').index();
        t.string('slug').notNullable();
        t.string('label').notNullable();
        t.boolean('is_system').defaultTo(false);
        t.timestamps(true, true);
        t.unique(['project', 'slug']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('doc_types');
};
