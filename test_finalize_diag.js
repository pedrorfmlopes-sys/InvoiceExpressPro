process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILENAME = 'data/db.sqlite';
const knex = require('./server/src/db/knex');
const controller = require('./server/src/modules/coreV2/controller');
const SatelliteStorage = require('./server/src/storage/SatelliteStorage');

const project = 'Proj_2026';
const items = [{ id: '6ea3cd59-0f9a-4ac6-aa33-cb7dcbd4d256', docType: 'fatura', docNumber: '25/00144' }];

async function runTest() {
    console.log("--- Starting Finalize Simulation ---");
    const req = {
        project,
        body: { items, force: false }
    };
    const res = {
        json: (data) => console.log("RESPONSE:", JSON.stringify(data, null, 2)),
        status: (code) => {
            console.log("STATUS:", code);
            return res;
        }
    };

    try {
        await controller.finalizeBulk(req, res);
    } catch (e) {
        console.error("FATAL ERROR:", e);
    } finally {
        // Close connections to allow script to exit
        await knex.destroy();
        // Since we refactored SatelliteStorage to use Knex, we might need to close those too if they stay open
        console.log("--- End of Simulation ---");
        process.exit(0);
    }
}

runTest();
