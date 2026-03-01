
const knex = require('c:/Users/pedro/OneDrive/APPS/GitHub/InvoiceStudioGRVTY-main/server/src/db/knex');
const service = require('c:/Users/pedro/OneDrive/APPS/GitHub/InvoiceStudioGRVTY-main/server/src/modules/proposalStudio/service');


async function run() {
    const docId = 'ccbdce14-6869-499d-b102-66efc8e5c0c9';
    console.log('Cloning doc:', docId);

    // We need to simulate the cloneToProposal call
    // But since it inserts into DB, we'll just check the lines after cleanup
    const result = await service.cloneToProposal('Proj_2026', docId, 'tester');
    console.log('Clone Result:', result);

    const proposalLines = await knex('proposal_lines').where({ proposal_id: result.proposalId });
    console.log('Total Lines:', proposalLines.length);

    for (const l of proposalLines) {
        const extra = JSON.parse(l.extra_attributes);
        console.log(`SKU: ${l.sku} | Finish: ${extra.finishCode} | Weeks: ${l.lead_time_weeks}`);
    }

    // Cleanup
    await knex('proposal_lines').where({ proposal_id: result.proposalId }).delete();
    await knex('custom_proposals').where({ id: result.proposalId }).delete();

    process.exit();
}

run().catch(console.error);
