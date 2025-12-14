exports.up = async function (knex) {
    const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
    if (isPg) {
        // Enforce extension
        await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        // Create Indexes for ILIKE performance
        // Using raw SQL because Knex doesn't support generic GIN op class syntax easily
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_docs_trgm_doc_number ON documents USING gin ("docNumber" gin_trgm_ops)');
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_docs_trgm_supplier ON documents USING gin (supplier gin_trgm_ops)');
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_docs_trgm_customer ON documents USING gin (customer gin_trgm_ops)');
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_docs_trgm_doc_type ON documents USING gin ("docType" gin_trgm_ops)');
    }
};

exports.down = async function (knex) {
    const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
    if (isPg) {
        await knex.raw('DROP INDEX IF EXISTS idx_docs_trgm_doc_type');
        await knex.raw('DROP INDEX IF EXISTS idx_docs_trgm_customer');
        await knex.raw('DROP INDEX IF EXISTS idx_docs_trgm_supplier');
        await knex.raw('DROP INDEX IF EXISTS idx_docs_trgm_doc_number');
        // We do NOT drop the extension as it's a global server capability that others might rely on
    }
};
