
exports.up = function (knex) {
    return knex.schema.table('custom_proposals', function (t) {
        t.jsonb('lead_time_rules').nullable(); // Array of rules: [{ target: 'global'|'collection:NAME', value: 8, unit: 'weeks'|'months'|'days' }]
    });
};

exports.down = function (knex) {
    return knex.schema.table('custom_proposals', function (t) {
        t.dropColumn('lead_time_rules');
    });
};
