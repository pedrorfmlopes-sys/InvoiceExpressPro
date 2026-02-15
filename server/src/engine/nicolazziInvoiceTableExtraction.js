const { normalizeDate } = require('./normalize');

// Helper: Parse EU Money (1.234,56 -> 1234.56)
function parseMoneyEU(str) {
    if (!str) return null;
    const clean = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziInvoiceTable(text) {
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        projectRef: null,
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
        debug: { extractor: 'nicolazziInvoiceTableExtraction (V3.3 - State Machine + ProjectRef)' }
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

        // --- Project Reference Parsing ---
        // Supports "Vostro Riferimento" OR "riferimento/Shipping Marks"
        if ((/Vostro Riferimento/i.test(line) || /Shipping Marks/i.test(line)) && !line.includes("Agente")) {
            const valLine = lines[i + 1];
            if (valLine) {
                // Strategy: The value is likely the first text block on the next line
                // Split by large spaces (e.g. 2 or more spaces) to separate columns
                const tokens = valLine.trim().split(/\s{2,}/);
                if (tokens.length > 0) {
                    let cand = tokens[0];
                    // Basic validation: ensure it's not P.IVA or a Country or Empty
                    if (cand && !cand.startsWith("PT") && !cand.startsWith("IT") && cand.length > 2 && !cand.includes("Riferimento")) {
                        extracted.projectRef = cand;
                    }
                }
            }
        }
    }

    // --- Entities Parsing (Spatial / Keyword) ---
    const ptVatEx = text.match(/PT(\d{9,15})/) || text.match(/Vat Number[\s\S]{1,500}?\b(\d{9,15})\b/i);
    if (ptVatEx) extracted.entities.customer.vat = ptVatEx[1];

    let foundCustomer = false;

    // Strategy: Hybrid (State Machine Aware)
    for (let i = 0; i < 20; i++) {
        if (foundCustomer) break;
        const line = lines[i] || "";
        const len = line.length;

        if (line.includes("NICOLAZZI") || line.includes("ALZO") || line.includes("Via P. Durio")) continue;

        let candidate = null;

        if (line.includes("Telefax") || line.includes("tel.") || line.includes("C.C.I.A.A.") || line.includes("Capitale Sociale")) {
            if (len > 90) {
                candidate = line.substring(90).trim();
            }
        } else {
            const firstCharIdx = line.search(/\S/);
            if (firstCharIdx > 25) {
                candidate = line.trim();
            }
        }

        if (candidate && candidate.length > 3) {
            if (candidate.includes("Appoggio") || candidate.includes("Date") || /Page|Pag\./i.test(candidate)) continue;
            if (candidate.match(/Porto|Terms|Agente|Banca|Payment|Shipping|Telefax|Capitale|Sociale/i)) continue;
            if (candidate.startsWith("tel.") || candidate.includes("r.a.")) continue;
            if (candidate === "INVOICE" || candidate === "FATTURA") continue;
            if (candidate.includes("DDT") || candidate.includes("Riferimento") || candidate.includes("vsrife")) continue;
            if (/^\d+$/.test(candidate)) continue;
            if (candidate.includes("119")) continue;
            if (candidate.includes("C.C.I.A.A.") || candidate.includes("Isc. Trib.") || candidate.includes("Part. IVA") || candidate.includes("Cod. Fiscale")) continue;

            if (candidate.match(/Portogallo|Portugal|Italy|Italia|Lisbona|Trofa/i) && !extracted.entities.customer.name) continue;
            if (candidate.match(/Portogallo|Portugal|Italy|Italia/) && extracted.entities.customer.name) {
                extracted.entities.customer.address = (extracted.entities.customer.address ? extracted.entities.customer.address + ", " : "") + candidate;
                continue;
            }

            if (/^\d{4}-\d{3}/.test(candidate) && !extracted.entities.customer.name) continue;

            if (candidate.includes("Spett.le") || candidate.includes("Messrs")) {
                const clean = candidate.replace(/Spett\.le|Messrs/gi, "").trim();
                if (clean.length > 3) extracted.entities.customer.name = clean;
                else continue;
            }

            if (!extracted.entities.customer.name) {
                extracted.entities.customer.name = candidate;
            } else {
                extracted.entities.customer.address = (extracted.entities.customer.address ? extracted.entities.customer.address + ", " : "") + candidate;
            }
        }
    }

    // --- Totals Parsing (Backwards Scan) ---
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/Totale da pagare/i.test(line) || (/Totale/i.test(line) && /EUR/i.test(lines[i - 1]))) {
            let matches = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
            if (!matches && lines[i + 1]) matches = lines[i + 1].match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
            if (!matches && i > 0) matches = lines[i - 1].match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);

            if (matches && matches.length > 0) {
                extracted.totals.total = parseMoneyEU(matches[matches.length - 1]);
            }
        }
    }

    // Grid Strategy
    let headersIdx = -1;
    for (let i = lines.length - 1; i > 20; i--) {
        if (lines[i].includes("Totale netto merce")) {
            headersIdx = i;
            break;
        }
    }

    if (headersIdx > -1) {
        for (let offset = 1; offset <= 5; offset++) {
            const valLine = lines[headersIdx + offset];
            if (!valLine) continue;
            const moneys = valLine.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
            if (moneys && moneys.length >= 3) {
                extracted.totals.goods = parseMoneyEU(moneys[0]);
                if (!extracted.totals.total) extracted.totals.total = parseMoneyEU(moneys[moneys.length - 1]);
                if (moneys.length === 4) extracted.totals.transport = parseMoneyEU(moneys[1]);
                break;
            }
        }
    }

    if (extracted.totals.goods) extracted.totals.subtotal = extracted.totals.goods;

    // --- Table Parsing (State Machine V3.2) ---
    let inTableZone = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const lower = line.toLowerCase();

        // 1. Zone Start / Resume
        if ((lower.includes('articolo') && lower.includes('descrizione')) ||
            (lower.includes('position') && lower.includes('article') && lower.includes('amount'))) {
            inTableZone = true;
            continue;
        }

        // 2. Zone Stop (Footer)
        if (inTableZone) {
            if (lower.includes('totale netto merce') || lower.includes('in relazione al presente') || lower.includes('... continua')) {
                inTableZone = false;
                continue;
            }
        }

        // 3. Process Lines
        if (inTableZone) {
            if (lower.match(/nicolazzi\s+s\.p\.a\./) || lower.includes('privacy information')) continue;
            if (line.includes("DDT Nr.")) continue;
            if (lower.includes("we declare that goods")) continue;
            if (line.includes("Pag.")) continue;
            if (lower.includes("scadenza / maturity")) continue;

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

                    // Detect Ord. Ref via Double Space Gap (Same logic as below)
                    let ordRef = null;
                    const columns = description.split(/\s{2,}/);
                    if (columns.length > 1) {
                        // Verify logic: Last col is Ref?
                        // Description was "Code ... Desc ... Ref ... UOM"
                        // But we already stripped Code (it's tokens[0]).
                        // Wait, description variable here holds "Code ... Desc ... Ref" (pre UOM/Qty)
                        // Actually 'description' variable in line 226 holds 'leftPart'.
                        // Then extracted uom/qty.
                        // So 'description' (line 237/235) holds "Code + Desc + Ref".

                        // Re-split using the updated 'description' variable
                        const cols = description.split(/\s{2,}/);
                        if (cols.length > 1) {
                            const candidate = cols.pop();
                            if (candidate.length < 25) {
                                ordRef = candidate;
                                description = cols.join(" ");
                            } else {
                                ordRef = null;
                            }
                        }
                    }

                    const tokens = description.split(/\s+/);
                    const code = tokens[0];
                    const finalDesc = tokens.slice(1).join(" ");

                    extracted.lines.push({
                        code,
                        description: finalDesc,
                        quantity: qty,
                        unitPrice,
                        total,
                        taxCode,
                        projectRef: ordRef
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

                // Detect Ord. Ref via Double Space Gap
                let ordRef = null;
                const columns = remainder.split(/\s{2,}/);
                // Expectation: [Code + Desc, OrdRef] or [Code, Desc, OrdRef]
                // But Code is always first token of the first block.

                if (columns.length > 1) {
                    const candidate = columns.pop();
                    if (candidate.length < 25) {
                        ordRef = candidate;
                        remainder = columns.join(" ");
                    } else {
                        ordRef = null;
                    }
                }

                const tokens = remainder.split(/\s+/);
                const code = tokens[0];
                const finalDesc = tokens.slice(1).join(" ");

                extracted.lines.push({
                    code,
                    description: finalDesc,
                    quantity: qty,
                    unitPrice,
                    total,
                    taxCode,
                    projectRef: ordRef // Save extracted Ref
                });
            } else {
                if (extracted.lines.length > 0) {
                    const last = extracted.lines[extracted.lines.length - 1];
                    if (!line.match(/Pag\.\s+\d+/i) && line.length > 2 && !line.includes("EUR") && !line.includes("Totale")) {
                        if (!line.match(/Ord\.?\s*Ref|Vostro\s*Ordine/i)) {
                            last.description = (last.description + " " + line).trim();
                        }
                    }
                }
            }
        }
    }

    // Computed Totals Fallback
    if (!extracted.totals.total || extracted.lines.length > 0) {
        const sumTotal = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);

        if (!extracted.totals.total || (extracted.totals.total < sumTotal && Math.abs(extracted.totals.total - sumTotal) > 1.0)) {
            extracted.totals.total = parseFloat(sumTotal.toFixed(2));
            if (!extracted.totals.goods) extracted.totals.goods = extracted.totals.total;
            extracted.totals.subtotal = extracted.totals.total;
            extracted.debug.computedTotals = true;
        }
    }

    if (!extracted.docNumber || !extracted.totals.total) extracted.needsReview = true;

    // --- Post-Processing: Description Cleanup & Extraction ---
    // 1. Identify valid Project Reference from Header
    // 2. Scan lines: If description contains Header Ref, extract it to line.projectRef and remove from description
    if (extracted.projectRef && extracted.lines.length > 0) {
        const safeRef = extracted.projectRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const refRegex = new RegExp(safeRef, 'g');

        extracted.lines.forEach(line => {
            if (line.description && line.description.includes(extracted.projectRef)) {
                // Extract to line level
                line.projectRef = extracted.projectRef;
                // Remove from description
                line.description = line.description.replace(refRegex, '').trim();
            }
        });
    }

    return extracted;
}

module.exports = extractNicolazziInvoiceTable;
