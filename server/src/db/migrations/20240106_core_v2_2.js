
exports.up = function (knex) {
    return knex.schema.table('documents', function (table) {
        table.string('docTypeId').nullable();
        table.string('docTypeLabel').nullable();
        table.string('docTypeRaw').nullable();
        table.string('docTypeSource').nullable(); // 'ai', 'regex', 'manual'
        table.float('docTypeConfidence').nullable();
        table.boolean('needsReviewDocType').defaultTo(false);
    });
};

exports.down = function (knex) {
    return knex.schema.table('documents', function (table) {
        table.dropColumn('docTypeId');
        table.dropColumn('docTypeLabel');
        table.dropColumn('docTypeRaw');
        table.dropColumn('docTypeSource');
        table.dropColumn('docTypeConfidence');
        table.dropColumn('needsReviewDocType');
    });
};
