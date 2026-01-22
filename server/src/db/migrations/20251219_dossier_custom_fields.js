exports.up = function (knex) {
    return knex.schema.table('dossier_nodes', function (t) {
        t.string('custom_1'); // Text field 1
        t.string('custom_2'); // Text field 2
    });
};

exports.down = function (knex) {
    return knex.schema.table('dossier_nodes', function (t) {
        t.dropColumn('custom_1');
        t.dropColumn('custom_2');
    });
};
