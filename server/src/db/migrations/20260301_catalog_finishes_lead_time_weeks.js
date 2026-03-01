/**
 * Migration: Add lead_time_weeks to catalog_finishes
 * (was missing — only lead_time_unit was added previously)
 */
exports.up = async function (knex) {
    const hasCol = await knex.schema.hasColumn('catalog_finishes', 'lead_time_weeks');
    if (!hasCol) {
        await knex.schema.table('catalog_finishes', table => {
            table.float('lead_time_weeks').nullable();
        });
    }
};

exports.down = async function (knex) {
    // SQLite doesn't support DROP COLUMN — skip for dev
};
