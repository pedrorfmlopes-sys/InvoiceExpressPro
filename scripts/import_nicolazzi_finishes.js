const xlsx = require('xlsx');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const EXCEL_PATH = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\Tabelas Gerais Excel\\2026\\NICOLAZZI_pt.xlsx';

async function importNicolazziFinishes() {
    console.log('[Import] Reading Excel file...', EXCEL_PATH);
    const wb = xlsx.readFile(EXCEL_PATH);

    if (!wb.SheetNames.includes('Acabamentos')) {
        console.error('[Import] Sheet "Acabamentos" not found.');
        process.exit(1);
    }

    const sheet = wb.Sheets['Acabamentos'];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`[Import] Found ${data.length} finishes. Processing...`);

    // Clean up existing nicolazzi finishes to avoid completely duplicate scenarios if re-run
    await knex('catalog_finishes').where({ brand: 'nicolazzi' }).del();

    const insertRows = [];

    for (const row of data) {
        if (!row.finish_code || !row.group_code) continue;

        insertRows.push({
            id: uuidv4(),
            brand: 'nicolazzi',
            finish_code: String(row.finish_code).trim(),
            group_code: String(row.group_code).trim(),
            name_it: row.name_it ? String(row.name_it).trim() : null,
            name_en: row.name_en ? String(row.name_en).trim() : null,
            note_pt: row.nota_pt_pt ? String(row.nota_pt_pt).trim() : null,
            technical_type: row.tipo_tecnico ? String(row.tipo_tecnico).trim() : null,
            protection: row.protecao ? String(row.protecao).trim() : null,
            created_at: new Date()
        });
    }

    if (insertRows.length > 0) {
        // SQLite doesn't strictly need batching for 20-30 rows, but doing 50 is safe
        const chunks = [];
        for (let i = 0; i < insertRows.length; i += 50) {
            chunks.push(insertRows.slice(i, i + 50));
        }

        for (const chunk of chunks) {
            await knex('catalog_finishes').insert(chunk);
        }
        console.log(`[Import] Successfully inserted ${insertRows.length} Nicolazzi finishes.`);
    } else {
        console.log('[Import] No valid finishes found to insert.');
    }

    process.exit(0);
}

importNicolazziFinishes().catch(e => {
    console.error(e);
    process.exit(1);
});
