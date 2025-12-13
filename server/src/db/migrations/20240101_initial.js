exports.up = function (knex) {
  return knex.schema
    .createTable('documents', function (t) {
      t.string('id').primary();
      t.string('project').index();
      t.string('docType');
      t.string('docNumber');
      t.string('supplier');
      t.string('customer');
      t.string('date'); // Using string to preserve exact format 'YYYY-MM-DD' or mixed from JSON
      t.string('dueDate');
      t.float('total'); // numeric/real
      t.string('status');
      t.string('filePath');
      t.text('rawJson'); // JSON string for extra fields
      t.string('batchId'); // Added for batch tracking logic
      t.timestamps(true, true);
    })
    .createTable('normalize_rules', function (t) {
      t.increments('id').primary();
      t.string('project').index();
      t.string('kind'); // supplier / customer
      t.string('alias');
      t.string('canonical');
      t.timestamps(true, true);
    })
    .createTable('audit_logs', function (t) {
      t.increments('id').primary();
      t.string('project').index();
      t.string('ts');
      t.string('action');
      t.text('payloadJson');
    })
    .createTable('config_secrets', function (t) {
      t.string('project').primary();
      t.text('openaiApiKeyEncrypted');
      t.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('config_secrets')
    .dropTable('audit_logs')
    .dropTable('normalize_rules')
    .dropTable('documents');
};
