exports.up = async function (knex) {
    if (await knex.schema.hasTable('dossier_nodes')) {
        await knex.schema.table('dossier_nodes', (table) => {
            table.string('icon_asset_id').nullable().references('id').inTable('assets').onDelete('SET NULL');
        });
    }
};

exports.down = async function (knex) {
    if (await knex.schema.hasTable('dossier_nodes')) {
        await knex.schema.table('dossier_nodes', (table) => {
            table.dropColumn('icon_asset_id');
        });
    }
};
