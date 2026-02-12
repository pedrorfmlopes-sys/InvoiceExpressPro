
const knex = require('./server/src/db/knex');

async function check() {
    try {
        console.log("Checking 'custom_proposals' table...");
        const proposals = await knex('custom_proposals').select('*');
        console.log(`Found ${proposals.length} proposals.`);

        proposals.forEach(p => {
            console.log(`- [${p.id}] ${p.name} (Project: ${p.project_ref}, Updated: ${p.updated_at})`);
        });

        console.log("\nChecking 'proposal_lines' table...");
        const lines = await knex('proposal_lines').select('*');
        console.log(`Found ${lines.length} lines globally.`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit();
    }
}

check();
