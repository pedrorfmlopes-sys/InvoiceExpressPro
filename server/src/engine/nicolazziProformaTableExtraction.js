const parseMoneyEU = (str) => {
    if (!str) return 0;
    const clean = str.replace(/\.(?=\d{3},)/g, '').replace(',', '.').replace(/[^-0-9.]/g, '');
    return parseFloat(clean) || 0;
};

/**
 * Highly Robust Nicolazzi Proforma Extractor
 * Optimized for 2025/2026 multi-page layouts from Poppler text.
 */
function extractNicolazziTable(text) {
    const extracted = {
        docType: 'proforma',
        docNumber: null,
        dates: { issued: null },
        entities: {
            customer: { name: null, address: null },
            supplier: { name: "NICOLAZZI s.p.a.", address: "Via Pietro Durio 119, 28010 ALZO DI PELLA (NO)" },
            shipTo: { name: null, address: null }
        },
        lines: [],
        totals: { subtotal: 0, transport: 0, tax: 0, total: 0 },
        docRefs: { customerRef: null },
        confidence: 0.95,
        needsReview: false,
        reviewReason: null
    };

    if (!text) return extracted;

    const lines = text.split('\n');
    let zone = 'header'; // 'header', 'items', 'footer'
    let foundSpett = false;
    let foundDelivery = false;
    let customerLines = [];
    let shipToLines = [];
    let nextLineIsRef = false;
    let nextLineIsTotals = false;

    const keywords = ['Delivery Address', 'Spett.le', 'Portogallo', 'Vat Number', 'Phone', 'Fax', 'Number', 'Date', 'Pag.', 'PROFORMA', 'TOTAL AMOUNT'];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // --- Header Columnar Parsing ---
        if (trimmed.includes('Spett.le')) foundSpett = true;
        if (trimmed.includes('Delivery Address')) foundDelivery = true;
        if (trimmed.includes('PROFORMA INVOICE')) {
            zone = 'items'; // Move out of header zone immediately
        }

        if ((foundSpett || foundDelivery) && zone === 'header') {
            // Nicolazzi Proforma Header Layout:
            // [Supplier Info (0-60)] [Delivery Info (65-107)] [Customer Info (107+)]
            const shipToPart = line.substring(62, 107).trim();
            const customerPart = line.substring(107).trim();

            const keywords = ['Delivery Address', 'Spett.le', 'Portogallo', 'Vat Number', 'Phone', 'Fax', 'Number', 'Date', 'Pag.', 'PROFORMA', 'TOTAL AMOUNT'];

            if (shipToPart && shipToPart.length > 3 && !keywords.some(k => shipToPart.includes(k))) {
                const clean = shipToPart.replace(/\s{3,}/g, ' ').replace(/Delivery Address/gi, '').trim();
                if (clean.length > 2 && !shipToLines.includes(clean)) shipToLines.push(clean);
            }
            if (customerPart && customerPart.length > 3 && !keywords.some(k => customerPart.includes(k))) {
                const clean = customerPart.replace(/\s{3,}/g, ' ').replace(/Spett\.le/gi, '').trim();
                if (clean.length > 2 && !customerLines.includes(clean)) customerLines.push(clean);
            }
        }

        // Doc Number
        if (!extracted.docNumber || extracted.docNumber.length < 5) {
            const mDoc = line.match(/(\d{2}\/\d{5})/) || line.match(/(\d{2,}\/\d{4,})/);
            if (mDoc && !line.includes('Tel') && !line.includes('Fax')) {
                extracted.docNumber = mDoc[1];
            }
        }

        // Date
        if (!extracted.dates.issued) {
            const mDate = line.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (mDate) {
                const parts = mDate[1].split('/');
                extracted.dates.issued = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        // Customer Ref / Project (Looks at next line)
        if (line.includes('your ref.')) {
            nextLineIsRef = true;
        } else if (nextLineIsRef) {
            const refVal = line.substring(35, 85).trim();
            if (refVal && refVal.length > 2) {
                extracted.docRefs.customerRef = refVal;
                nextLineIsRef = false;
            }
        }

        // --- Totals Zone (Footer) ---
        if (line.includes('Goods Value') && (line.includes('TOTAL AMOUNT') || line.includes('Charges'))) {
            nextLineIsTotals = true;
            zone = 'footer';
            continue;
        }

        if (nextLineIsTotals) {
            const moneyMatches = line.match(/\d+(?:\.\d{3})*,\d{2}/g);
            if (moneyMatches && moneyMatches.length >= 1) {
                const subVal = parseMoneyEU(line.substring(0, 55).trim());
                const transVal = parseMoneyEU(line.substring(55, 95).trim());
                const totVal = parseMoneyEU(line.substring(95).trim());

                if (subVal) extracted.totals.subtotal = subVal;
                if (transVal) extracted.totals.transport = transVal;
                if (!extracted.totals.subtotal && moneyMatches[0]) extracted.totals.subtotal = parseMoneyEU(moneyMatches[0]);

                if (totVal) {
                    extracted.totals.total = totVal;
                    nextLineIsTotals = false;
                }
            } else if (trimmed && (trimmed.includes('Price List') || trimmed.includes('Volume'))) {
                nextLineIsTotals = false;
            }
        }

        // Fallback total detection (max found)
        if (zone === 'footer' || line.includes('TOTAL AMOUNT')) {
            const moneyMatches = line.match(/\d+(?:\.\d{3})*,\d{2}/g);
            if (moneyMatches) {
                const val = parseMoneyEU(moneyMatches[moneyMatches.length - 1]);
                if (val > (extracted.totals.total || 0)) extracted.totals.total = val;
            }
        }

        // --- Item Zone Gating ---
        if (line.includes('Pos') && line.includes('Article')) {
            zone = 'items_found';
            continue;
        }

        // --- Item Extraction ---
        const columns = line.split(/\s{2,}/).map(c => c.trim()).filter(c => c.length > 0);
        const moneyRegex = /^\d+(?:\.\d{3})*,\d{2}$/;
        const hasMoney = columns.some(c => moneyRegex.test(c));

        if (columns.length >= 4 && hasMoney) {
            let tStr = null;
            let uStr = null;
            let dStr = null;
            let qVal = 1;
            let pCode = null;
            let desc = "";
            let posVal = null;

            if (moneyRegex.test(columns[columns.length - 1])) {
                tStr = columns[columns.length - 1];
                let penIdx = columns.length - 2;
                const penCand = columns[penIdx];
                const moneyPartRegex = /(\d+(?:\.\d{3})*,\d{2})/;
                const discPartRegex = /([\d\+]{1,7})/;
                const combinedMatch = penCand.match(new RegExp(moneyPartRegex.source + "\\s+" + discPartRegex.source));

                if (combinedMatch) {
                    uStr = combinedMatch[1];
                    dStr = combinedMatch[2];
                } else if (moneyRegex.test(penCand)) {
                    uStr = penCand;
                } else if (/^[\d\+]+$/.test(penCand) && penCand.length <= 8) {
                    dStr = penCand;
                    if (moneyRegex.test(columns[penIdx - 1])) uStr = columns[penIdx - 1];
                }
            }

            if (tStr && uStr) {
                let s = 0;
                if (/^\d+$/.test(columns[0])) {
                    posVal = columns[0];
                    s++;
                }
                if (columns[s] && (columns[s].length >= 4 || columns[s] === '.')) pCode = columns[s++];

                const priceColIdx = (columns.indexOf(uStr) !== -1) ? columns.indexOf(uStr) : columns.length - 2;

                if (priceColIdx > s) {
                    const qToken = columns[priceColIdx - 1];
                    if (/^\d+$/.test(qToken)) qVal = parseInt(qToken, 10);
                    desc = columns.slice(s, priceColIdx - 1).join(" ");
                }

                if (pCode) {
                    const lineObj = {
                        pos: posVal,
                        code: pCode,
                        description: desc.replace(/\s+/g, ' ').trim(),
                        quantity: qVal,
                        unitPrice: parseMoneyEU(uStr),
                        total: parseMoneyEU(tStr),
                        discountText: dStr || null
                    };

                    const isDup = extracted.lines.some(l =>
                        l.code === lineObj.code &&
                        l.pos === lineObj.pos &&
                        l.total === lineObj.total
                    );
                    if (!isDup) extracted.lines.push(lineObj);
                }
            }
        } else if (extracted.lines.length > 0 && !hasMoney && line.length > 3 && !line.includes('Mod.')) {
            const last = extracted.lines[extracted.lines.length - 1];
            if (!line.match(/^\d{1,3}\s+/) && !line.includes('NICOLAZZI') && !line.includes('Delivery Address') && !line.includes('Page')) {
                last.description = (last.description + " " + line).trim();
            }
        }
    }

    // Final Assembly
    if (customerLines.length > 0) {
        extracted.entities.customer.name = customerLines[0];
        extracted.entities.customer.address = customerLines.slice(1).join(', ');
    }
    if (shipToLines.length > 0) {
        extracted.entities.shipTo.name = shipToLines[0];
        extracted.entities.shipTo.address = shipToLines.slice(1).join(', ');
    }

    // Capture VAT Number (High Priority for CRM)
    // Often follows "Vat Number" label, but can be on subsequent lines if IBAN/Shipping is in between
    // We look for "Vat Number" and then the first 9-digit sequence within the next 500 characters
    const vatSectionMatch = text.match(/Vat Number[\s\S]{1,500}?\b(\d{9})\b/i);
    if (vatSectionMatch) {
        extracted.entities.customer.vat = vatSectionMatch[1];
    }

    const computedTotal = extracted.lines.reduce((acc, l) => acc + l.total, 0);
    if (!extracted.totals.total && computedTotal > 0) extracted.totals.total = computedTotal;
    if (!extracted.totals.subtotal && computedTotal > 0) extracted.totals.subtotal = computedTotal;

    if (!extracted.docNumber || !extracted.totals.total || extracted.lines.length === 0) {
        extracted.needsReview = true;
    }

    return extracted;
}

module.exports = extractNicolazziTable;
