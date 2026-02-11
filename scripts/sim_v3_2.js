const fs = require('fs');

// Helper: Parse EU Money
function parseMoneyEU(str) {
    if (!str) return null;
    const clean = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziInvoiceTableV3_2(text) {
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        projectRef: null,
        lines: [],
        totals: { total: null, goods: null },
        debug: { extractor: 'V3.2 - State Machine + ProjectRef' }
    };

    const lines = text.split('\n');
    let inTableZone = false;
    let tableStarted = false;

    // --- Header / Metadata Parsing ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Vostro Riferimento/i.test(line) && !line.includes("Agente")) { // Ensure strictly 'Vostro Riferimento' block
            const valLine = lines[i + 1];
            if (valLine) {
                // Strategy: The value is likely the first text block on the next line
                // But be careful of P.IVA which might be on the same line
                // In 049B: "                 ARQ.JOANA POSAS                                                          PT502952113"

                // Split by large spaces (e.g. 2 or more spaces) to separate columns
                // Or just grab text until P.IVA or next column

                // Let's try splitting by double space
                const tokens = valLine.trim().split(/\s{2,}/);
                if (tokens.length > 0) {
                    // Check if first token is not empty and not P.IVA
                    let cand = tokens[0];
                    if (cand && !cand.startsWith("PT") && !cand.startsWith("IT") && cand.length > 2) {
                        extracted.projectRef = cand;
                    }
                }
            }
        }
    }

    // --- Totals Parsing (Backwards Scan for Grand Total) ---
    // We do this first because the table logic might skip the last page footer
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/Totale da pagare/i.test(line) || (/Totale/i.test(line) && /EUR/i.test(lines[i - 1]))) {
            let matches = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
            if (matches) {
                extracted.totals.total = parseMoneyEU(matches[matches.length - 1]);
                break; // Found grand total
            }
        }
    }

    // --- State Machine Parsing ---
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const lower = line.toLowerCase();

        // 1. Check for Table Start / Resume
        if ((lower.includes('articolo') && lower.includes('descrizione')) ||
            (lower.includes('position') && lower.includes('article'))) {
            inTableZone = true;
            tableStarted = true;
            continue; // Skip the header line itself
        }

        // 2. Check for Table Stop (Page Footer)
        if (inTableZone) {
            if (lower.includes('totale netto merce') || lower.includes('in relazione al presente') || lower.includes('... continua')) {
                inTableZone = false;
                // console.log(`[DEBUG] Zone PAUSED at line ${i}: ${line.substring(0, 30)}...`);
                continue;
            }
        }

        // 3. Process Lines ONLY if in Zone
        if (inTableZone) {
            // Safety: Skip random noise that might still be inside the zone
            if (lower.match(/nicolazzi\s+s\.p\.a\./) || line.includes("Pag.")) continue;

            // ... (Existing Line Parsing Logic) ...
            if (line.includes("EUR")) {
                const flexibleRegex = /EUR\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+([A-Z0-9]+))?/;
                const compMatch = line.match(flexibleRegex);

                if (compMatch) {
                    const unitPrice = parseMoneyEU(compMatch[1]);
                    const total = parseMoneyEU(compMatch[2]);
                    const taxCode = compMatch[3];
                    const leftPart = line.substring(0, compMatch.index).trim();
                    let qty = 1;
                    let description = leftPart;

                    const qtyMatch = leftPart.match(/(\d+)\s*$/);
                    if (qtyMatch) {
                        qty = parseInt(qtyMatch[1]);
                        const preQty = leftPart.substring(0, qtyMatch.index).trim();
                        const uomMatch = preQty.match(/(NR|PZ|CF|KG|M|COPPIA|PAIO|SET|ML)$/i);
                        if (uomMatch) {
                            description = preQty.substring(0, preQty.length - uomMatch[1].length).trim();
                        } else {
                            description = preQty;
                        }
                    }

                    const tokens = description.split(/\s+/);
                    const code = tokens[0];
                    const finalDesc = tokens.slice(1).join(" ");

                    extracted.lines.push({ code, description: finalDesc, quantity: qty, unitPrice, total, taxCode });
                    continue;
                }
            }

            // Standard Regex (No EUR)
            const money = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
            const endRegex = new RegExp(`(${money})\\s+(${money})(?:\\s+([A-Z0-9]+))?$`);
            const match = line.match(endRegex);

            if (match && !line.includes("EUR")) {
                const unitPrice = parseMoneyEU(match[1]);
                const total = parseMoneyEU(match[2]);
                const taxCode = match[3];
                let remainder = line.substring(0, match.index).trim();

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
                extracted.lines.push({ code, description: finalDesc, quantity: qty, unitPrice, total, taxCode });
            } else {
                // Formatting Append
                if (extracted.lines.length > 0) {
                    const last = extracted.lines[extracted.lines.length - 1];
                    if (!line.match(/Pag\.\s+\d+/i) && line.length > 2 && !line.includes("EUR") && !line.includes("Totale")) {
                        last.description = (last.description + " " + line).trim();
                    }
                }
            }
        }
    }

    // Check sums
    const sumLine = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
    extracted.linesSum = parseFloat(sumLine.toFixed(2));
    extracted.linesCount = extracted.lines.length;

    return extracted;
}

const debugText = fs.readFileSync('debug_049B.txt', 'utf8');
const result = extractNicolazziInvoiceTableV3_2(debugText);
console.log(JSON.stringify(result, null, 2));
