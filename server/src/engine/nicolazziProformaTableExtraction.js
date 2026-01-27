const { normalizeDate } = require('./normalize');

// Helper: Parse EU Money (1.234,56 -> 1234.56)
function parseMoneyEU(str) {
    if (!str) return null;
    // Strict check: must look like money? No, parse loose, validate later.
    const clean = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
}

function extractNicolazziTable(text) {
    const extracted = {
        docType: 'proforma',
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: null,
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
        reviewReason: null
    };

    const lines = text.split('\n');

    // --- Header Parsing (Line-Based) ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Number.*Date/i.test(line)) {
            const valLine = lines[i + 1];
            if (valLine) {
                const mNum = valLine.match(/(\d{2,}\/\d{2,})/);
                if (mNum) extracted.docNumber = mNum[1].trim();

                const mDate = valLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (mDate) extracted.dates.issued = normalizeDate(mDate[1]);
            }
        }
    }

    // --- Entities Parsing (Dynamic Columns) ---
    let shipToLines = [];
    let customerLines = [];
    let inEntityBlock = false;

    let delIdx = -1;
    let spetIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('Delivery Address')) delIdx = line.indexOf('Delivery Address');
        if (line.includes('Spett.le')) spetIdx = line.indexOf('Spett.le');

        if (delIdx > -1 || spetIdx > -1) {
            inEntityBlock = true;
            if (line.includes('Delivery Address') || line.includes('Spett.le')) continue;
        }

        if (line.includes('PROFORMA INVOICE')) {
            inEntityBlock = false;
            break;
        }

        if (inEntityBlock) {
            // Supplier is usually < delIdx
            // Delivery is usually >= delIdx and < spetIdx
            // Customer is usually >= spetIdx

            const deliveryPart = (delIdx > -1 && spetIdx > -1) ? line.substring(delIdx - 5, spetIdx).trim() : '';
            const customerPart = (spetIdx > -1) ? line.substring(spetIdx - 5).trim() : '';

            // Further split customer part if it contains the zip code on the same line but separated
            if (deliveryPart && !/Via Pietro Durio/i.test(deliveryPart)) {
                // Clean up side-pollution from Nicolazzi info
                const cleanD = deliveryPart.split(/\s{3,}/)[0];
                if (cleanD.length > 2) shipToLines.push(cleanD);
            }
            if (customerPart) {
                const cleanC = customerPart.split(/\s{3,}/)[0];
                if (cleanC.length > 2) customerLines.push(cleanC);
            }
        }
    }

    if (customerLines.length > 0) {
        extracted.entities.customer.name = customerLines[0];
        extracted.entities.customer.address = customerLines.slice(1).join(', ');
    }

    if (shipToLines.length > 0) {
        // Filter out Nicolazzi's own info if it leaked into shipTo
        const filteredShipTo = shipToLines.filter(line => !/DURIO|ALZO|PIETRO|NICOLAZZI|S\.P\.A/i.test(line));

        if (filteredShipTo.length > 0) {
            extracted.entities.shipTo = {
                name: filteredShipTo[0],
                address: filteredShipTo.slice(1).join(', ')
            };
            // Normalize for canonical output
            extracted.entities.customer.deliveryAddress = extracted.entities.shipTo.address;
        } else {
            extracted.entities.shipTo = null;
        }
    }

    // Customer VAT
    const mVat = text.match(/Vat Number\s*[\s\S]{0,300}?\b(\d{9,11})\b/i);
    if (mVat) extracted.entities.customer.vat = mVat[1];

    // Customer Reference ("your ref.")
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('your ref.')) {
            const labelPos = line.toLowerCase().indexOf('your ref.');

            // 1. Try checking line below at approximately the same index (preferred for Nicolazzi)
            const below = lines[i + 1];
            let val = '';
            if (below) {
                // Take a slice around the same horizontal position
                val = below.substring(labelPos - 5, labelPos + 40).trim().split(/\s{2,}/)[0];
            }

            // 2. If below is empty or looks like junk, try same line but strictly after label
            if (!val || val.length < 3) {
                val = line.substring(labelPos + 9, labelPos + 40).trim().split(/\s{2,}/)[0];
            }

            if (val && val.length > 2 && !/your ref/i.test(val) && !/Shipping|Phone|Fax/i.test(val)) {
                // Anti-Pollution: Strictly block IBANs, BIC, SWIFT, etc.
                const cleanVal = val.replace(/\s/g, '');
                const isBank = /^[A-Z]{2}\d{15,}/.test(cleanVal) ||
                    /BANK|IBAN|BIC|SWIFT|CREDITO|VREDO|VAL|TRANSFER|BONIFICO/i.test(val);

                if (!isBank) {
                    extracted.docRefs = extracted.docRefs || {};
                    // Cleanup any trailing/leading symbols common in these OCRs
                    extracted.docRefs.customerRef = val.replace(/^[:\.\-\s]+|[:\.\-\s]+$/g, '').trim();
                    break;
                }
            }
        }
    }

    // --- Totals Parsing ---
    // Nicolazzi Totals are in a grid:
    // Goods Value | Transport Charges | TOTAL AMOUNT
    // [Value]    | [Value]           |
    // Price List | Cash Discount     | [Total Value]

    const allMoneys = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g) || [];
    const gIdxText = text.lastIndexOf('Goods Value');

    if (gIdxText !== -1) {
        // We look for money values that appear AFTER the "Goods Value" header
        const textAfterHeaders = text.substring(gIdxText);
        const moneysAfter = textAfterHeaders.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g) || [];

        if (moneysAfter.length >= 2) {
            extracted.totals.goods = parseMoneyEU(moneysAfter[0]);
            extracted.totals.transport = parseMoneyEU(moneysAfter[1]);

            // Total is usually the next one after some other fields (like Cash Discount)
            // In 015.pdf: 330,00 (Goods), 25,00 (Transport), 0,00 (Cash Disc), 355,00 (Total)
            // So Total is either the 3rd or 4th money value.
            // Let's find a value that matches Sum(Goods, Transport, Tax)
            for (let i = 2; i < Math.min(moneysAfter.length, 6); i++) {
                const candidate = parseMoneyEU(moneysAfter[i]);
                const sum = (extracted.totals.goods || 0) + (extracted.totals.transport || 0);
                if (Math.abs(candidate - sum) < 0.05 && candidate > 0) {
                    extracted.totals.total = candidate;
                    break;
                }
            }
            // Fallback for total if sum logic didn't hit (e.g. zero values)
            if (extracted.totals.total === null && moneysAfter.length >= 3) {
                // If it's the very last money value in the proximty
                extracted.totals.total = parseMoneyEU(moneysAfter[moneysAfter.length - 1]);
            }
        }
    }

    if (extracted.totals.total && !extracted.totals.goods && extracted.totals.goods !== 0) {
        extracted.totals.goods = extracted.totals.total;
    }
    extracted.totals.subtotal = extracted.totals.goods;

    if (extracted.totals.total !== null && extracted.totals.subtotal !== null) {
        const diff = Math.abs((extracted.totals.subtotal || 0) + (extracted.totals.transport || 0) - (extracted.totals.total || 0));
        if (diff < 0.05) extracted.totals.tax = 0;
    }


    // --- Table Parsing with Buffer ---
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.match(/Pos\s*Article/i) || (l.match(/Unit\s*Value/i) && l.match(/Amount/i))) {
            startIdx = i + 1;
            break;
        }
    }

    if (startIdx > 0) {
        for (let i = startIdx; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Stop at Footer
            if (line.match(/Goods\s+Value/i) && i > lines.length - 20) break;

            // Page Header/Footer / Section Headers Junk
            if (line.match(/NICOLAZZI\s+s\.p\.a\.|Via\s+Pietro\s+Durio|ALZO\s+DI\s+PELLA|tel\.|Telefax|Capitale\s+Sociale/i)) continue;
            if (line.match(/Number\s+Date\s+Pag\.|Payment\s+Condition|Our\s+Bank|Our\s+Ref\.|your\s+ref\./i)) continue;
            if (line.match(/Pos\s+Article|Description|Quantity|Unit\s+Value|Discount|Amount|Vat\s+Number|Delivery\s+Address/i)) continue;
            if (line.match(/^\d{2}\/\d{2}\/\d{4}/)) continue; // Date line
            if (line.match(/^Pos\s+/i)) continue;

            // Nicolazzi specific: Skip Section Headers (Pos 0)
            if (line.match(/^0\s+/) || line === "0") continue;

            // Money Regex for totals at end of line
            const moneyRegexStr = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
            const combinedRegex = new RegExp(`(${moneyRegexStr})\\s+([\\d\\+]+)?\\s*(${moneyRegexStr})$`);
            const match = line.match(combinedRegex);

            if (match) {
                const uStr = match[1];
                const dStr = match[2];
                const tStr = match[3];
                let descPart = line.substring(0, match.index).trim();

                // Extract Qty from end of description part
                const mQty = descPart.match(/(\d+)\s*$/);
                let q = 1;
                if (mQty) {
                    q = parseInt(mQty[1], 10);
                    descPart = descPart.substring(0, mQty.index).trim();
                }

                // Remove Leading Position Number (Pos > 0)
                descPart = descPart.replace(/^\d+[\s\.\-]+/, '').trim();

                // Extract Article Code (Look for first word that looks like a code)
                let pCode = null;
                const words = descPart.split(/\s+/);
                for (let j = 0; j < Math.min(words.length, 3); j++) {
                    const w = words[j];
                    if (w.length >= 4 && /\d/.test(w) && !w.includes(',')) {
                        pCode = w;
                        descPart = descPart.replace(w, '').trim();
                        break;
                    }
                }

                // Clean Description junk
                descPart = descPart.replace(/^[\.\-\s]+/, '').replace(/\s{2,}/g, ' ').trim();

                const lineObj = {
                    code: pCode,
                    description: descPart,
                    quantity: q,
                    unitPrice: parseMoneyEU(uStr),
                    total: parseMoneyEU(tStr),
                    discountText: dStr || null
                };

                // Math Validation
                let exp = lineObj.unitPrice * lineObj.quantity;
                if (lineObj.discountText) {
                    const parts = lineObj.discountText.split('+');
                    for (const p of parts) exp *= (1 - parseFloat(p) / 100);
                }
                if (Math.abs(exp - lineObj.total) > 0.05) {
                    extracted.needsReview = true;
                }

                extracted.lines.push(lineObj);
            } else {
                // Continuation line -> append to PREVIOUS item
                if (extracted.lines.length > 0) {
                    const last = extracted.lines[extracted.lines.length - 1];
                    // Avoid appending tiny junk or page labels
                    if (!line.match(/Pag\.\s+\d+/i) && line.length > 2) {
                        last.description = (last.description + " " + line).trim();
                    }
                }
            }
        }
    }

    if (!extracted.docNumber || !extracted.totals.total) extracted.needsReview = true;
    // --- Anti-Contamination Guard (ShipTo) ---
    // User Requirement: Reject if matches "Durio", "ALZO" or matches Supplier Address
    if (extracted.entities.shipTo) {
        const sName = (extracted.entities.shipTo.name || "").toUpperCase();
        const sAddr = (extracted.entities.shipTo.address || "").toUpperCase();

        // Explicit Pollution Tokens
        if (/DURIO|ALZO|PIETRO/i.test(sName) || /DURIO|ALZO|PIETRO/i.test(sAddr)) {
            extracted.entities.shipTo = null;
            // We set needsReview because we nuked a potentially valid-but-borked field, or just to warn?
            // "needsReview=true if shipTo matches supplier address tokens" - Validated Requirement F.
            extracted.needsReview = true;
            extracted.reviewReason = (extracted.reviewReason ? extracted.reviewReason + "; " : "") +
                "ShipTo matched Supplier Address (Set to NULL)";
        }
    }

    return extracted;
}

module.exports = extractNicolazziTable;
