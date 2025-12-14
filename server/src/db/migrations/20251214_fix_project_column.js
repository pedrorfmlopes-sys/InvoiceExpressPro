exports.up = async function (knex) {
    const hasProject = await knex.schema.hasColumn('documents', 'project');

    if (!hasProject) {
        await knex.schema.table('documents', function (t) {
            t.string('project').defaultTo('default').index();
        });
    }

    // Backfill nulls (idempotent safe)
    await knex('documents')
        .whereNull('project')
        .update({ project: 'default' });
};

exports.down = function (knex) {
    // We do NOT drop the column in down migration to avoid data loss
    // properly, strict down would drop it if we created it, 
    // but detecting "did we create it" is hard. 
    // This is a fix-forward migration.
    return Promise.resolve();
};
