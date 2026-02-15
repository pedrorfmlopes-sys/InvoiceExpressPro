exports.up = function (knex) {
    return knex.schema.table('customers', function (table) {
        table.string('country').nullable().after('address');
    });
};

exports.down = function (knex) {
    return knex.schema.table('customers', function (table) {
        table.dropColumn('country');
    });
};
