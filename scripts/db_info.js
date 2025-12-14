// scripts/db_info.js
require('dotenv').config();
// Requiring knex.js triggers the connection log
const knex = require('../server/src/db/knex');
console.log('Use "npm run db:health" to test connection.');
process.exit(0);
