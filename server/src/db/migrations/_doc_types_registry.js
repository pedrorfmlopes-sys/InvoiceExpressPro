exports.up = function (knex) {
    return knex.schema.createTable('doc_types', function (t) {
        t.increments('id').primary();
        t.string('project').index();
        t.string('slug').notNullable();
        t.string('label').notNullable();
        t.boolean('is_system').defaultTo(false);
        t.timestamps(true, true);
        t.unique(['project', 'slug']);
    }).then(async () => {
        // Seed defaults? Ideally handled by app logic on demand, but we can seed generic ones for 'default' project or logic that seeds on get
        // We will leave empty and let the service seed on first access or migration? 
        // Let's seed for 'default' project just in case, but real app allows multi-project.
        // Better: The Service should ensure defaults exist if list is empty.
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('doc_types');
};
