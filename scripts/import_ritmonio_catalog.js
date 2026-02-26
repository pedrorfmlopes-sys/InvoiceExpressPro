const xlsx = require('xlsx');
const knex = require('../server/src/db/knex');
const { v4: uuidv4 } = require('uuid');

async function importRitmonio() {
    console.log("Starting Ritmonio Catalog Import...");

    const filePath = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\Tabelas Gerais Excel\\2026\\Tabela Ritmonio 2026_PT.xlsx';
    console.log(`Reading file: ${filePath}`);

    let wb;
    try {
        wb = xlsx.readFile(filePath);
    } catch (e) {
        console.error("Failed to read Excel file! Ensure it is not open in Excel.", e.message);
        process.exit(1);
    }

    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`Loaded ${data.length} rows. Parsing...`);

    const headers = data[0];
    const itemsToInsert = [];

    // Column Mappings based on inspection
    const colFam = 2; // Familia -> series
    const colSku = 3; // Codart -> sku
    const colDes1PT = 4; // Des_1_PT
    const colDes2PT = 5; // Des_2_PT
    const colDes1EN = 6; // Des_1
    const colDes2EN = 7; // Des_2
    const colEAN = 8; // GTIN-13
    const colPrice = 10; // PL39 Lista de precios

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[colSku]) continue;

        const sku = String(row[colSku]).trim();
        const series = row[colFam] ? String(row[colFam]).trim() : '';
        const descPt = [row[colDes1PT], row[colDes2PT]].filter(Boolean).map(s => String(s).trim()).join(' ').replace(/\s+_/g, '');
        const descEn = [row[colDes1EN], row[colDes2EN]].filter(Boolean).map(s => String(s).trim()).join(' ').replace(/\s+_/g, '');

        let price = parseFloat(row[colPrice]);
        if (isNaN(price)) price = 0;

        const metadata = { ean: row[colEAN] || '' };

        itemsToInsert.push({
            id: uuidv4(),
            brand: 'RITMONIO',
            sku: sku,
            series: series,
            description_pt: descPt,
            description_en: descEn,
            price: price,
            source: 'Tabela 2026_PT',
            metadata: JSON.stringify(metadata)
        });
    }

    console.log(`Found ${itemsToInsert.length} valid SKUs. Clearing old RITMONIO catalog data...`);
    await knex('catalog_items').where({ brand: 'RITMONIO' }).del();

    console.log(`Inserting objects into database in chunks...`);
    const chunkSize = 200;
    for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
        const chunk = itemsToInsert.slice(i, i + chunkSize);
        process.stdout.write(`Inserting chunk ${i / chunkSize + 1}/${Math.ceil(itemsToInsert.length / chunkSize)}... `);
        await knex('catalog_items').insert(chunk);
        process.stdout.write(`Done.\n`);
    }

    console.log("\n✅ RITMONIO CATALOG IMPORTED SUCCESSFULLY!");
    console.log(`Total SKUs available: ${itemsToInsert.length}`);
    process.exit(0);
}

importRitmonio();
