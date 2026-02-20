exports.up = function (knex) {
    return knex.schema.table('custom_proposals', table => {
        table.string('proposal_number').nullable(); // Adding proposal_number column to store clean ref.
    });
};

exports.down = function (knex) {
    return knex.schema.table('custom_proposals', table => {
        table.dropColumn('proposal_number');
    });
};
