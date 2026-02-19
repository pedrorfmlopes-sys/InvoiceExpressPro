const { normalizeDate } = require('./normalize');

function parseMoneyEU(str) {
    if (!str) return null;
    const clean = str.replace(/\.(?=\d{3},)/g, '').replace(',', '.').replace(/[^-0-9.]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziInvoiceTable(text) {
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        projectRef: null,
        shippingMarks: null,
        orderRef: null,
        shipmentDetails: null,
        dates: { issued: null, due: null },
        totals: { subtotal: null, total: null },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            shipping: { name: null, address: null },
            supplier: { name: "NICOLAZZI s.p.a." }
        },
        debug: { extractor: 'nicolazzi (V11.5 - Clean Revert)' }
    };

    if (!text) return extracted;
    const allLines = text.split('\n');
    let inTableZone = false;
    let lineBuffer = [];
    let customerBuffer = [];
    let collectingAddress = true;

    // Helper to detect column boundaries from a line
    const getAnchorIndex = (line) => {
        const umMatch = line.match(/\b(NR|PZ|CF)\b/);
        return umMatch ? umMatch.index : -1;
    };

    const legalRegex = /In relazione al presente documento|assumendo agli efeitos|delle vigenti disposizioni|piena e diretta|responsabilita|dichiara di garantir|veridicità di quanto|da esso resulta|risulta|effettivamente concordati|corrispondenti di massima|correnti noti/i;

    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        const trimmed = line.trim();
        if (!trimmed) continue;

        // KILL SWITCH: Stop processing lines once legal footer starts
        if (line.match(legalRegex)) {
            break;
        }

        // Meta Data (Header) - Improved Address Logic
        if (i < 60 && collectingAddress) {
            // Nicolazzi metadata usually ends before index 95. Client starts at 100.
            const rightPart = line.length > 100 ? line.substring(100).trim() : "";

            const stopTerms = /Fattura|INVOICE|Numero|Data|Codice|Banca|Condizione|Payment|Annotazioni|riferimento|Shipping Marks|Volume|Colli|Peso|Privacy|Banca/i;
            const supplierTerms = /NICOLAZZI|ALZO|IVA|Fiscale|Trib\.|Capitale|Via P\.|Durio|Telefax|tel\.|Telefax/i;

            if (rightPart.length > 2) {
                if (rightPart.match(stopTerms) || trimmed.match(/Fattura|INVOICE/i)) {
                    collectingAddress = false;
                } else if (!rightPart.match(supplierTerms) && !rightPart.match(/^\d{4}/)) {
                    if (!customerBuffer.includes(rightPart)) customerBuffer.push(rightPart);
                }
            }
        }

        // Other metadata (numbers, dates)
        if (i < 80) {
            // Document Number
            if (!extracted.docNumber && (/Numero\/.*Number/i.test(line) || /Fattura.*INVOICE/i.test(line))) {
                const m = (allLines[i + 1] || "").match(/(\d{5,}\/[A-Z])/i) || (allLines[i + 1] || "").match(/(\d{3,})/i);
                if (m) extracted.docNumber = m[1].trim();
            }
            // Date
            if (!extracted.dates.issued && /Data\/.*Date/i.test(line)) {
                const m = (allLines[i + 1] || "").match(/(\d{2}\/\d{2}\/\d{4})/);
                if (m) extracted.dates.issued = normalizeDate(m[1]);
            }

            // Project Ref (Vostro Riferimento)
            if (!extracted.projectRef && /Vostro Riferimento/i.test(line)) {
                let nextL = (allLines[i + 1] || "").substring(0, 90).trim();
                extracted.projectRef = nextL;
            }

            // Shipping Marks
            if (!extracted.shippingMarks && /Shipping Marks/i.test(line)) {
                let part = line.split(/Shipping Marks/i)[1]?.trim();
                if (part && part.length > 2 && !part.match(/Volume|Colli|Peso/i)) {
                    extracted.shippingMarks = part.replace(/^[:\-\s/]+/, '').trim();
                }
            }
        }

        // Table Gating
        if (trimmed.match(/Articolo.*Descrizione/i) || trimmed.match(/Descrizione.*Ord\. Ref/i)) {
            inTableZone = true;
            continue;
        }
        if (inTableZone && (trimmed.toLowerCase().includes("totale netto merce") || trimmed.toLowerCase().includes("totale documento"))) {
            inTableZone = false;
        }

        // Table Parsing
        if (inTableZone) {
            if (trimmed.match(/^Segue|^Pag\.|^Numero\/ Number/i)) continue;

            const moneyPattern = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
            const isFinRow = trimmed.includes("EUR") && trimmed.match(new RegExp(moneyPattern));

            if (isFinRow) {
                const allRows = [...lineBuffer, line];
                lineBuffer = [];
                let code = "", description = "", ordRef = "", qty = 0, unitPrice = 0, total = 0;

                const moneyMatches = line.match(new RegExp(moneyPattern, 'g'));
                if (moneyMatches && moneyMatches.length >= 2) {
                    unitPrice = parseMoneyEU(moneyMatches[moneyMatches.length - 2]);
                    total = parseMoneyEU(moneyMatches[moneyMatches.length - 1]);
                }

                allRows.forEach(row => {
                    const rowAnchor = getAnchorIndex(row);
                    // PURE LAYOUT: Fixed coordinates (Standard Nicolazzi Grid)
                    const skuPart = row.substring(0, 30).trim();
                    const descPart = row.substring(30, 88).trim();
                    const refPart = row.substring(88, 132).trim();

                    if (skuPart && !code && !skuPart.match(/DDT|Nr\.|del|Data|Articolo/i)) {
                        code = skuPart;
                    }
                    if (descPart) description += " " + descPart;
                    // Fix: Only ignore if it's ONLY the UOM, not if it's part of the ref string
                    if (refPart && !refPart.match(/^(NR|PZ|CF)$/)) {
                        ordRef += (ordRef ? " " : "") + refPart;
                    }

                    if (row.includes("EUR")) {
                        const qM = row.match(/\s+(\d+)\s+(?:EUR|NR|PZ)/);
                        if (qM) qty = parseInt(qM[1]);
                    }
                });

                description = description.replace(/\s{2,}/g, ' ').trim();

                // Justify/Clean Ref Column
                if (ordRef) {
                    ordRef = ordRef.replace(/\s+(NR|PZ|PZ\/NR|CF|NR\/NR)$/i, '').trim() || null;
                }

                if (code || total > 0) {
                    extracted.lines.push({
                        code: code || "SKU_PENDING",
                        description,
                        projectRef: ordRef,
                        uom: "NR",
                        quantity: qty || 1,
                        unitPrice: unitPrice ? parseFloat(unitPrice.toFixed(2)) : 0,
                        total: total ? parseFloat(total.toFixed(2)) : 0
                    });
                }
            } else {
                const skuM = line.substring(0, 30).match(/([A-Z]*\d{3,}[A-Z0-9.\-]*)/);
                const isHeading = trimmed.match(/Articolo|Descrizione|Fattura|Numero/i);

                if (!skuM && !isHeading && extracted.lines.length > 0) {
                    // BACKWARD ANNEXATION: Text row sticks to the PREVIOUS item
                    const last = extracted.lines[extracted.lines.length - 1];
                    let dPart = line.substring(30, 88).trim();
                    const rPart = line.substring(88, 132).trim();

                    if (dPart) last.description += " " + dPart;
                    if (rPart && !rPart.match(/^(NR|PZ|CF)$/)) {
                        const cleanR = rPart.replace(/\s+(NR|PZ|PZ\/NR|CF|NR\/NR)$/i, '').trim();
                        if (cleanR) last.projectRef = (last.projectRef || "") + (last.projectRef ? " " : "") + cleanR;
                    }
                } else if (trimmed.length > 2 && !isHeading) {
                    // Buffer for the NEXT financial row
                    lineBuffer.push(line);
                }
            }
        }
    }

    if (customerBuffer.length > 0) {
        extracted.entities.customer.name = customerBuffer[0];
        extracted.entities.customer.address = customerBuffer.slice(1, 4).join(", ");
    }

    // Improved Totals Logic
    const subtotalMatch = text.match(/Totale netto merce[\s\S]{1,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (subtotalMatch) extracted.totals.subtotal = parseMoneyEU(subtotalMatch[1]);

    const grossTotalMatch = text.match(/Totale\s+EUR[\s\S]{1,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i) ||
        text.match(/Totale\s*(?:\d{1,3}(?:\.\d{3})*,\d{2})?[\s\S]{1,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i);

    if (grossTotalMatch) {
        extracted.totals.total = parseMoneyEU(grossTotalMatch[1]);
    } else {
        // Fallback: Sum lines if footer total not found
        extracted.totals.total = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
    }

    // Normalize for Viewer (net/gross) and ensure 2 decimals
    const subVal = extracted.totals.subtotal || extracted.lines.reduce((s, l) => s + (l.total || 0), 0);
    const grossVal = extracted.totals.total || subVal;

    extracted.totals.net = parseFloat(subVal || 0).toFixed(2);
    extracted.totals.gross = parseFloat(grossVal || 0).toFixed(2);

    return extracted;
}

module.exports = extractNicolazziInvoiceTable;
