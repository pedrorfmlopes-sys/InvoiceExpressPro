const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\pedro\\OneDrive - DIVITEK\\Tabelas Gerais Excel\\2026\\NICOLAZZI_pt.xlsx";
const sheetName = "Acabamentos";

try {
    console.log(`Reading file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);

    if (!workbook.SheetNames.includes(sheetName)) {
        console.error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
        process.exit(1);
    }

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Header 1 returns array of arrays

    console.log("--- Header (First 1 row) ---");
    console.log(JSON.stringify(data[0], null, 2));

    console.log("\n--- Sample Data (Next 10 rows) ---");
    console.log(JSON.stringify(data.slice(1, 11), null, 2));

} catch (e) {
    console.error(`Error reading Excel: ${e.message}`);
}
