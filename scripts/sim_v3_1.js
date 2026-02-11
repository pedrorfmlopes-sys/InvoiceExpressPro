const fs = require('fs');
const path = require('path');
const { normalizeDate } = require('../server/src/engine/normalize'); // Adjusted path

// Mocking logic for standalone run
function parseMoneyEU(str) {
    if (!str) return null;
    const clean = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziInvoiceTableV3_1(text) {
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: 0,
            total: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: {
                name: "NICOLAZZI s.p.a.",
                vat: "IT00115930034",
                address: "28010 ALZO (NO) - Via P. Durio, 119"
            },
            shipTo: null
        },
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: { extractor: 'nicolazziInvoiceTableExtraction (V3.1 - Sim)' }
    };

    const lines = text.split('\n');

    // --- Header Parsing (Line-Based) ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Number.*Date/i.test(line) || /Numero\/.*Number/i.test(line)) {
            const valLine = lines[i + 1];
            if (valLine) {
                const mDate = valLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (mDate) extracted.dates.issued = normalizeDate(mDate[1]);

                let possibleNumLine = valLine;
                if (mDate && valLine.trim().length < 12) {
                    if (lines[i - 1] && lines[i - 1].trim().length > 3) {
                        possibleNumLine = lines[i - 1];
                    }
                }
                const tokens = possibleNumLine.trim().split(/\s+/);
                const possibleNum = tokens[0];
                if (possibleNum && possibleNum.length >= 3 && /\d/.test(possibleNum) && !possibleNum.includes("Pag")) {
                    extracted.docNumber = possibleNum;
                }
            }
        }
    }

    // --- Totals Parsing ---
    let headersIdx = -1;
    for (let i = lines.length - 1; i > 20; i--) {
        if (lines[i].includes("Totale netto merce")) {
            headersIdx = i;
            // Scan down up to 10 lines to find the totals line containing EUR
            // In 049B, the "Totale netto merce" is line 128, content is empty space until line 132 (Total)
            for (let offset = 1; offset <= 10; offset++) {
                const valLine = lines[i + offset];
                if (!valLine) continue;
                const moneys = valLine.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
                // Warning: In 049B line 132 has "10.278,25 ... 10.278,25 ... 10.278,25"
                if (moneys && moneys.length >= 1) {
                    // If multiple moneys, usually Goods, Tax, Total etc. 
                    // In 049B case: goods, taxable, total.
                    extracted.totals.total = parseMoneyEU(moneys[moneys.length - 1]);
                    if (!extracted.totals.goods) extracted.totals.goods = parseMoneyEU(moneys[0]);
                }
            }
            break;
        }
    }

    // Fallback Total Scan
    if (!extracted.totals.total) {
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (/Totale da pagare/i.test(line) || (/Totale/i.test(line) && /EUR/i.test(lines[i - 1]))) {
                // Try looking at previous line or same line for value
                let valLine = line;
                let matches = valLine.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
                if (!matches && lines[i - 1]) matches = lines[i - 1].match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);

                if (matches && matches.length > 0) {
                    extracted.totals.total = parseMoneyEU(matches[matches.length - 1]);
                }
            }
        }
    }


    extracted.totals.subtotal = extracted.totals.goods;

    // --- Table Parsing ---
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.match(/Articolo/i) && l.match(/Descrizione/i) && l.match(/Valore/i)) {
            startIdx = i + 1;
            break;
        }
    }

    if (startIdx > 0) {
        for (let i = startIdx; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            const lower = line.toLowerCase();

            // CRITICAL FIX: Do NOT break, just continue
            if (lower.includes('totale netto merce') || lower.includes('in relazione al presente')) continue;

            // Skip Header Repeat Blocks
            if (lower.match(/nicolazzi\s+s\.p\.a\./) || lower.includes('privacy information')) continue;
            if (line.includes("DDT Nr.")) continue;
            if (lower.includes("we declare that goods")) continue;
            if (lower.includes("numero/") || lower.includes("agente") || lower.includes("vostro riferimento")) continue;
            if (line.includes("Pag.")) continue;

            if (line.includes("EUR")) {
                const flexibleRegex = /EUR\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+([A-Z0-9]+))?/;
                const compMatch = line.match(flexibleRegex);

                if (compMatch) {
                    const unitPrice = parseMoneyEU(compMatch[1]);
                    const total = parseMoneyEU(compMatch[2]);
                    const taxCode = compMatch[3];

                    const leftPart = line.substring(0, compMatch.index).trim();
                    let qty = 1;
                    let uom = "NR";
                    let description = leftPart;

                    const qtyMatch = leftPart.match(/(\d+)\s*$/);
                    if (qtyMatch) {
                        qty = parseInt(qtyMatch[1]);
                        const preQty = leftPart.substring(0, qtyMatch.index).trim();

                        const uomMatch = preQty.match(/(NR|PZ|CF|KG|M|COPPIA|PAIO|SET|ML)$/i);
                        if (uomMatch) {
                            uom = uomMatch[1];
                            description = preQty.substring(0, preQty.length - uom.length).trim();
                        } else {
                            description = preQty;
                        }
                    }

                    const tokens = description.split(/\s+/);
                    const code = tokens[0];
                    const finalDesc = tokens.slice(1).join(" ");

                    extracted.lines.push({
                        code, description: finalDesc, quantity: qty, unitPrice, total, taxCode
                    });
                    continue;
                }
            }

            const money = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
            const endRegex = new RegExp(`(${money})\\s+(${money})(?:\\s+([A-Z0-9]+))?$`);
            const match = line.match(endRegex);

            if (match && !line.includes("EUR")) {
                const unitPrice = parseMoneyEU(match[1]);
                const total = parseMoneyEU(match[2]);
                const taxCode = match[3];
                let remainder = line.substring(0, match.index).trim();

                // Safety check: if remainder looks like header info, skip
                if (remainder.includes("Colli") || remainder.includes("Peso")) continue;

                let qty = 1;
                const qtyMatch = remainder.match(/(\d+)\s*$/);
                if (qtyMatch) {
                    qty = parseInt(qtyMatch[1]);
                    remainder = remainder.substring(0, qtyMatch.index).trim();
                }
                const uomMatch = remainder.match(/\b(NR|PZ|CF|KG|M|COPPIA|PAIO|SET)\s*$/i);
                if (uomMatch) {
                    remainder = remainder.substring(0, uomMatch.index).trim();
                }
                const tokens = remainder.split(/\s+/);
                const code = tokens[0];
                const finalDesc = tokens.slice(1).join(" ");
                extracted.lines.push({
                    code, description: finalDesc, quantity: qty, unitPrice, total, taxCode
                });
            } else {
                if (extracted.lines.length > 0) {
                    const last = extracted.lines[extracted.lines.length - 1];
                    // Append only if it's not a header line
                    if (!line.match(/Pag\.\s+\d+/i) && line.length > 2 && !line.includes("EUR") && !line.includes("Totale")) {
                        if (!line.includes("NICOLAZZI")) // Double check
                            last.description = (last.description + " " + line).trim();
                    }
                }
            }
        }
    }

    // Computed Totals Fallback
    if (!extracted.totals.total || extracted.lines.length > 0) { // Check if sum is better?
        const sumTotal = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
        // If extracted total found, compare with sum. If sum > extracted total (meaning extracted was partial), use sum.
        // Or if extracted total is null.
        if (!extracted.totals.total || Math.abs(sumTotal - extracted.totals.total) > 1.0) {
            // console.log(`[DEBUG] Updating total from ${extracted.totals.total} to Sum ${sumTotal}`);
            extracted.totals.total = parseFloat(sumTotal.toFixed(2));
            extracted.totals.goods = extracted.totals.total;
            extracted.totals.subtotal = extracted.totals.total;
            extracted.debug.computedTotals = true;
        }
    }

    return extracted;
}

// Execute Simulation
const debugText = fs.readFileSync('debug_049B.txt', 'utf8');
const result = extractNicolazziInvoiceTableV3_1(debugText);
console.log(JSON.stringify(result, null, 2));
