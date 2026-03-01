/**
 * One-time migration: normalize legacy note_pt data in catalog_finishes
 *   - If note_pt is plain text → copy to description_pt (if not already set)
 *   - If note_pt is JSON with lead_time_weeks → copy to lead_time_weeks column
 */
const knex = require('../server/src/db/knex');

async function migrate() {
    const rows = await knex('catalog_finishes').select('id', 'brand', 'finish_code', 'note_pt', 'description_pt', 'lead_time_weeks');
    let descMigrated = 0;
    let ltMigrated = 0;
    let skipped = 0;

    for (const row of rows) {
        if (!row.note_pt) { skipped++; continue; }

        let isJson = false;
        let parsed = null;
        try {
            parsed = JSON.parse(row.note_pt);
            isJson = true;
        } catch (e) { /* plain text */ }

        if (isJson && parsed) {
            // JSON lead time data
            const updates = {};
            if (parsed.lead_time_weeks != null && row.lead_time_weeks == null) {
                updates.lead_time_weeks = parsed.lead_time_weeks;
            }
            if (Object.keys(updates).length > 0) {
                await knex('catalog_finishes').where({ id: row.id }).update({ ...updates, updated_at: new Date() });
                ltMigrated++;
                console.log(`  [LT]  ${row.brand}/${row.finish_code}: lead_time_weeks = ${parsed.lead_time_weeks}`);
            } else {
                skipped++;
            }
        } else {
            // Plain text description
            if (!row.description_pt) {
                await knex('catalog_finishes').where({ id: row.id }).update({ description_pt: row.note_pt, updated_at: new Date() });
                descMigrated++;
                console.log(`  [DSC] ${row.brand}/${row.finish_code}: description_pt set`);
            } else {
                skipped++;
            }
        }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Descriptions migrated: ${descMigrated}`);
    console.log(`  Lead times migrated:   ${ltMigrated}`);
    console.log(`  Skipped (no change):   ${skipped}`);
    await knex.destroy();
}

migrate().catch(e => { console.error('Migration FAILED:', e.message); process.exit(1); });
