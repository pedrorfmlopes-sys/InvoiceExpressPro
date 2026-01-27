exports.up = async function (knex) {
    const hasGroupId = await knex.schema.hasColumn('doc_links', 'group_id');

    if (!hasGroupId) {
        // In SQLite, dropping/re-creating is often easier for schema overhaul
        await knex.schema.dropTableIfExists('doc_links');

        await knex.schema.createTable('doc_links', function (t) {
            t.string('group_id').notNullable().index(); // UUID identifying the cluster
            t.string('doc_id').references('id').inTable('documents').onDelete('CASCADE');
            t.text('metadata'); // JSON string for relationship type etc (using text for sqlite compatibility)
            t.primary(['group_id', 'doc_id']); // Composite PK
            t.index('doc_id'); // Fast lookup by doc
        });
        console.log('[Migration] doc_links updated to v2 schema');
    }
};

exports.down = function (knex) {
    // No easy way to go back to v1 logic without data loss if we had data,
    // but since it was empty, we just drop.
    return knex.schema.dropTableIfExists('doc_links');
};
