/**
 * Migration: Add extra_json column to catalog_items
 * Used by AXA (and future brands) to store EAN codes and other non-standard fields.
 * Compatible with both SQLite (local) and PostgreSQL (Render).
 */
exports.up = async function (knex) {
    const hasCol = await knex.schema.hasColumn('catalog_items', 'extra_json');
    if (!hasCol) {
        await knex.schema.table('catalog_items', (table) => {
            table.text('extra_json').nullable().defaultTo(null);
        });
        console.log('[Migration] Added extra_json to catalog_items');
    }
};

exports.down = async function (knex) {
    const hasCol = await knex.schema.hasColumn('catalog_items', 'extra_json');
    if (hasCol) {
        await knex.schema.table('catalog_items', (table) => {
            table.dropColumn('extra_json');
        });
    }
};
