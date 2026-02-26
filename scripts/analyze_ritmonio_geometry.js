const fs = require('fs');
const path = require('path');
const { extractWithCoords } = require('../server/src/utils/pdfCoords');

const INV_DIR = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\faturas';
const CONF_DIR = 'C:\\Users\\pedro\\OneDrive - DIVITEK\\A-Divitek - Divitek\\03 - RITMONIO\\Documentos\\confirmacoes';

const INVOICES = ['FA5 2504904.pdf', 'Fattura_FA5 B2500235_C013316.pdf'];
const CONFS = ['ns conf ord 25.pdf', 'C-2025-OA2-3146.PDF'];

async function analyzeRows(filePath, type) {
    console.log(`\n\n=== ANALYZING ${type.toUpperCase()}: ${path.basename(filePath)} ===`);
    const buffer = fs.readFileSync(filePath);
    const pages = await extractWithCoords(buffer);

    if (!pages || pages.length === 0) {
        console.log("No pages extracted.");
        return;
    }

    const p1 = pages[0].items;

    // Find Header Strategy
    const headerRow = p1.find(i => /Articolo|Item|Codice/i.test(i.str));
    if (!headerRow) {
        console.log("!! NO HEADER ROW FOUND !!");
        // Print dense cluster to see what's happening
        const midY = p1.filter(i => i.y < 700 && i.y > 300).sort((a, b) => b.y - a.y);
        console.log("Sample Middle Area:\n", midY.slice(0, 15).map(i => `[Y:${i.y.toFixed(1)} X:${i.x.toFixed(1)}] ${i.str}`).join('\n'));
        return;
    }

    console.log(`Found Header at Y: ${headerRow.y.toFixed(1)} -> ${headerRow.str}`);

    // Group rows by Y coordinate
    const rows = {};
    for (const page of pages) {
        // Only look below header and above footer
        const items = [...page.items].sort((a, b) => b.y - a.y);

        let curRowKey = null;
        for (let it of items) {
            // Very loose grouping
            let placed = false;
            for (let y in rows) {
                if (Math.abs(parseFloat(y) - it.y) < 5) {
                    rows[y].push(it);
                    placed = true;
                    break;
                }
            }
            if (!placed) rows[it.y.toFixed(1)] = [it];
        }
    }

    // Sort Y descending (top to bottom)
    const sortedY = Object.keys(rows).sort((a, b) => parseFloat(b) - parseFloat(a));

    let count = 0;
    console.log("--- TABLE BODY (Top 15 rows below header) ---");
    for (const y of sortedY) {
        if (parseFloat(y) >= headerRow.y - 10) continue; // Skip above header

        const rowItems = rows[y].sort((a, b) => a.x - b.x);
        const text = rowItems.map(i => i.str).join(' | ');

        if (text.includes('Totale') || text.includes('Subtotal')) break; // Stop at footer

        console.log(`Row Y:${y} -> ${text}`);
        count++;
        if (count > 15) break;
    }
}

async function run() {
    for (let inv of INVOICES) await analyzeRows(path.join(INV_DIR, inv), 'Invoice');
    for (let conf of CONFS) await analyzeRows(path.join(CONF_DIR, conf), 'Confirmation');
}

run();
