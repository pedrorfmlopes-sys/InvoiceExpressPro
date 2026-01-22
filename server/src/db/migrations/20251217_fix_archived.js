exports.up = async function (knex) {
    const hasArchived = await knex.schema.hasColumn('documents', 'archived');
    if (!hasArchived) {
        await knex.schema.table('documents', t => {
            t.boolean('archived').defaultTo(false);
            t.index(['project', 'archived', 'date']);
        });
    }
};

exports.down = function (knex) {
    return knex.schema.table('documents', t => {
        t.dropColumn('archived');
    });
};
