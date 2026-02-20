const knex = require('../server/src/db/knex');

async function backfill() {
    console.log('[Backfill] Starting Proposal Number extraction...');
    const proposals = await knex('custom_proposals').select('id', 'name');

    let updated = 0;

    for (const p of proposals) {
        // Regex to find XX/XXXXX
        const match = p.name.match(/(\d{2}\/\d{5})/);

        if (match) {
            const cleanNum = match[1];
            await knex('custom_proposals')
                .where({ id: p.id })
                .update({ proposal_number: cleanNum });
            console.log(`[UPDATE] "${p.name}" -> [${cleanNum}]`);
            updated++;
        } else {
            console.log(`[SKIP] No pattern found in: "${p.name}"`);
        }
    }

    console.log(`[Backfill] Done. Updated ${updated} proposals.`);
    process.exit();
}

backfill();
