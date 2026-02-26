/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
    // 1. Fix casing for catalog_items
    await knex('catalog_items')
        .where('brand', 'RITMONIO')
        .update({ brand: 'ritmonio' });

    await knex('catalog_items')
        .where('brand', 'NICOLAZZI')
        .update({ brand: 'nicolazzi' });

    // 2. Fix casing for catalog_finishes
    await knex('catalog_finishes')
        .where('brand', 'RITMONIO')
        .update({ brand: 'ritmonio' });

    await knex('catalog_finishes')
        .where('brand', 'NICOLAZZI')
        .update({ brand: 'nicolazzi' });

    console.log('[Migration] Brand casing fixed for ritmonio and nicolazzi.');
};

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
    // No rollback needed for data normalization usually, 
    // but if we must, we could revert to uppercase.
};
