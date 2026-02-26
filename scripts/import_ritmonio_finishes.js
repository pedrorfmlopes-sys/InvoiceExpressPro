const xlsx = require('xlsx');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function importRitmonioFinishes() {
    console.log("Starting Ritmonio Finishes Import...");
    const filePath = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\Tabelas Gerais Excel\\2026\\Tabela Ritmonio 2026_PT.xlsx';
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets['Acabamentos'];
    if (!sheet) {
        console.error("Acabamentos sheet not found!");
        process.exit(1);
    }

    // Ignore empty lines and headers
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const finishes = [];

    // Start from row 3 (index 2)
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[1]) continue;

        const code = String(row[1]).trim(); // Codigo
        const nameEn = String(row[2]).trim(); // Nome_EN
        const leadDays = parseInt(row[3]) || 0; // Tempo produção (dias uteis)
        const isStarred = row[6] === 'Sim'; // Marcado asterisco

        const leadTimeWeeks = Math.ceil(leadDays / 5);

        finishes.push({
            id: uuidv4(),
            brand: 'RITMONIO',
            finish_code: code,
            group_code: isStarred ? 'STARRED' : 'STANDARD',
            name_en: nameEn,
            note_pt: JSON.stringify({ lead_time_days: leadDays, lead_time_weeks: leadTimeWeeks }),
            created_at: knex.fn.now()
        });
    }

    console.log(`Found ${finishes.length} Ritmonio finishes. Clearing old...`);
    await knex('catalog_finishes').where({ brand: 'RITMONIO' }).del();

    console.log(`Inserting finishes...`);
    await knex('catalog_finishes').insert(finishes);

    console.log(`✅ Ritmonio finishes imported!`);
    process.exit(0);
}

importRitmonioFinishes();
