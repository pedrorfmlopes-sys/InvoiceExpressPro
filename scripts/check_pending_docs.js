const knex = require('knex');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../data/db.sqlite');
const db = knex({
    client: 'sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true
});

(async () => {
    try {
        console.log("Checking pending documents in DB:", dbPath);

        const counts = await db('documents')
            .select('status', 'project')
            .count('* as count')
            .whereIn('status', ['uploaded', 'staging', 'extracted'])
            .groupBy('status', 'project');

        console.log("Pending Counts by Project:", counts);

        const rows = await db('documents')
            .whereIn('status', ['uploaded', 'staging', 'extracted'])
            .limit(5);

        console.log("Sample Rows:", rows.map(r => ({ id: r.id, status: r.status, project: r.project })));

    } catch (e) {
        console.error("Error", e);
    } finally {
        await db.destroy();
    }
})();
