/**
 * Migration: Enhance library tables for full management UI
 * - Add `description` to catalog_collections
 * - Add `lead_time_unit` to catalog_collections and catalog_finishes
 *   (possible values: 'days', 'weeks', 'months' — internal storage stays in weeks)
 */
exports.up = async function (knex) {
    // catalog_collections enhancements
    const hasCollectionDesc = await knex.schema.hasColumn('catalog_collections', 'description');
    if (!hasCollectionDesc) {
        await knex.schema.table('catalog_collections', table => {
            table.text('description').nullable();
        });
    }

    const hasCollectionUnit = await knex.schema.hasColumn('catalog_collections', 'lead_time_unit');
    if (!hasCollectionUnit) {
        await knex.schema.table('catalog_collections', table => {
            table.string('lead_time_unit').defaultTo('weeks'); // 'days' | 'weeks' | 'months'
        });
    }

    // catalog_finishes enhancements
    const hasFinishUnit = await knex.schema.hasColumn('catalog_finishes', 'lead_time_unit');
    if (!hasFinishUnit) {
        await knex.schema.table('catalog_finishes', table => {
            table.string('lead_time_unit').defaultTo('weeks');
        });
    }
};

exports.down = async function (knex) {
    // SQLite doesn't support DROP COLUMN — skip for dev
};
