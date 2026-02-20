const knex = require('../src/db/knex');

async function debugProposals() {
    try {
        console.log('--- DIAGNOSTIC: PROPOSALS ---');
        const proposals = await knex('custom_proposals').select('id', 'name', 'project_ref');

        if (proposals.length === 0) {
            console.log('NO PROPOSALS FOUND in DB.');
        } else {
            console.log(`Found ${proposals.length} proposals:`);
            proposals.forEach(p => {
                console.log(`- ID: ${p.id} | Name: "${p.name}" | ProjectRef: "${p.project_ref}"`);
            });
        }
        console.log('-----------------------------');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

debugProposals();
