exports.up = async function (knex) {
    // 1. Documents Indexes
    const hasDocs = await knex.schema.hasTable('documents');
    if (hasDocs) {
        await knex.schema.alterTable('documents', table => {
            // Add indexes conditionally is hard in standard knex without raw SQL queries
            // We will try/catch the index creation blocks or use raw queries per dialect
            // Simplified approach: Create standard indexes if they are missing logic is verbose.
            // Instead, we focus on safe additions.

            table.index(['project', 'status'], 'idx_docs_proj_stat');
            table.index('docNumber', 'idx_docs_number');
        }).catch(err => {
            // Ignore "index already exists" errors common in re-runs
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) throw err;
        });
    }

    // 2. Transactions Indexes
    const hasTx = await knex.schema.hasTable('transactions');
    if (hasTx) {
        await knex.schema.alterTable('transactions', table => {
            table.index(['project', 'status'], 'idx_tx_proj_stat');
            table.index('orgId', 'idx_tx_org');
        }).catch(err => {
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) throw err;
        });
    }
};

exports.down = function (knex) {
    // Dropping indexes is optional but good practice
    return knex.schema.alterTable('documents', t => {
        t.dropIndex(['project', 'status'], 'idx_docs_proj_stat');
        t.dropIndex('docNumber', 'idx_docs_number');
    }).then(() => {
        return knex.schema.alterTable('transactions', t => {
            t.dropIndex(['project', 'status'], 'idx_tx_proj_stat');
            t.dropIndex('orgId', 'idx_tx_org');
        });
    }).catch(() => Promise.resolve());
};
