exports.up = async function (knex) {
    // 1. Sub Projects
    if (!(await knex.schema.hasTable('sub_projects'))) {
        await knex.schema.createTable('sub_projects', function (t) {
            t.string('id').primary(); // uuid
            t.string('project').nullable().index(); // NULL = Global
            t.string('name').notNullable();
            t.string('code');
            t.text('description');
            t.timestamps(true, true);
        });
    }

    // 2. Doc Categories
    if (!(await knex.schema.hasTable('doc_categories'))) {
        await knex.schema.createTable('doc_categories', function (t) {
            t.string('id').primary(); // uuid
            t.string('project').nullable().index(); // NULL = Global
            t.string('name').notNullable();
            t.string('scope'); // personal, professional, mixed
            t.string('parent_id');
            t.string('at_code');
            t.timestamps(true, true);
        });
    }

    // 3. Doc Links (Group based)
    if (!(await knex.schema.hasTable('doc_links'))) {
        await knex.schema.createTable('doc_links', function (t) {
            t.string('group_id').notNullable().index(); // UUID identifying the cluster
            t.string('doc_id').references('id').inTable('documents').onDelete('CASCADE');
            t.json('metadata'); // relationship type etc
            t.primary(['group_id', 'doc_id']); // Composite PK
            t.index('doc_id'); // Fast lookup by doc
        });
    }

    // 4. User Preferences
    if (!(await knex.schema.hasTable('user_preferences'))) {
        await knex.schema.createTable('user_preferences', function (t) {
            t.string('user_id').notNullable().index(); // String ID (No FK)
            t.string('project').nullable();
            t.string('key').notNullable();
            t.text('value'); // JSON
            t.unique(['user_id', 'project', 'key']);
        });
    }

    // 5. Update Documents Table (Check columns individually)
    const hasSub = await knex.schema.hasColumn('documents', 'sub_project_id');
    const hasCat = await knex.schema.hasColumn('documents', 'category_id');
    const hasScope = await knex.schema.hasColumn('documents', 'scope');
    const hasArchived = await knex.schema.hasColumn('documents', 'archived');
    const hasSync = await knex.schema.hasColumn('documents', 'at_sync_status');

    await knex.schema.table('documents', function (t) {
        if (!hasSub) t.string('sub_project_id').references('id').inTable('sub_projects');
        if (!hasCat) t.string('category_id').references('id').inTable('doc_categories');
        if (!hasScope) t.string('scope');

        if (!hasArchived) {
            t.boolean('archived').defaultTo(false);
            t.index(['project', 'archived', 'date']);
            t.index(['project', 'archived', 'created_at']);
        }

        if (!hasSync) t.string('at_sync_status').defaultTo('none');
    });
};

exports.down = function (knex) {
    // Down migration remains simple (drop if exists)
    return knex.schema
        .table('documents', function (t) {
            // t.dropIndex... often problematic in SQLite if constraint names vary, leaving simplified
            t.dropColumn('at_sync_status');
            t.dropColumn('archived');
            t.dropColumn('scope');
            t.dropColumn('category_id');
            t.dropColumn('sub_project_id');
        })
        .dropTableIfExists('user_preferences')
        .dropTableIfExists('doc_links')
        .dropTableIfExists('doc_categories')
        .dropTableIfExists('sub_projects');
};
