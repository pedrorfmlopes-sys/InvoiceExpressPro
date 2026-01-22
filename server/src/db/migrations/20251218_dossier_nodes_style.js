exports.up = async function (knex) {
    if (await knex.schema.hasTable('dossier_nodes')) {
        await knex.schema.table('dossier_nodes', (table) => {
            table.json('style').nullable(); // Stores { bgColor, shadow, colSpan, etc. }
        });
    }
};

exports.down = async function (knex) {
    if (await knex.schema.hasTable('dossier_nodes')) {
        await knex.schema.table('dossier_nodes', (table) => {
            table.dropColumn('style');
        });
    }
};
