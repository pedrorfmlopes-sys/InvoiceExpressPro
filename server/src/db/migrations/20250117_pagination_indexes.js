exports.up = async function (knex) {
    if (await knex.schema.hasTable('documents')) {
        await knex.schema.alterTable('documents', (table) => {
            // Check if indexes exist? Knex doesn't support "hasIndex" easily across DBs universally,
            // but we can try-catch or assume this is new dev.
            // SQLite ignores dupe indexes mostly, PG throws.
            // Best effort naming.
            table.index(['project', 'status'], 'idx_docs_proj_status');
            table.index(['project', 'docType'], 'idx_docs_proj_type');
            table.index(['project', 'date'], 'idx_docs_proj_date');
        });
    }
};

exports.down = async function (knex) {
    if (await knex.schema.hasTable('documents')) {
        await knex.schema.alterTable('documents', (table) => {
            table.dropIndex(['project', 'status'], 'idx_docs_proj_status');
            table.dropIndex(['project', 'docType'], 'idx_docs_proj_type');
            table.dropIndex(['project', 'date'], 'idx_docs_proj_date');
        });
    }
};
