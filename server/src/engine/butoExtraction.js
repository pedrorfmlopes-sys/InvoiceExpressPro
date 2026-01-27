const { normalizeAmount, normalizeDate } = require('./normalize');

// --- A) Money Normalization (BUTO-specific) ---
function normalizeAmountButo(raw) {
    if (!raw) return null;
    let clean = raw.trim();

    // Specific case: 1.720 (no decimal separator, only dots for thousands)
    // Regex: Start, 1-3 digits, then (dot followed by 3 digits) one or more times, end.
    // AND check that it doesn't have a comma.
    // e.g. "1.720" -> match. "1.720,00" -> no match.
    if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) {
        clean = clean + ',00';
    }

    return normalizeAmount(clean);
}

function extractButoInternal(text) {
    const extracted = {
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: null,
            total: null,
            discountMain: null,
            discountExtra: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: { name: null, vat: null, address: null }
        },
        paymentStatus: null,
        debug: {
            butoProfileVersion: "BUTO_PROFILE__TOTALS_OLD_FIX__2026-01-23",
            extractor: (process.env.NODE_ENV === 'development' ? 'butoInvoiceExtraction' : undefined)
        }
    };


    // --- Doc Number ---
    const refRegex = /INT\/\d{2}-\d{6}/g;
    const allRefs = text.match(refRegex) || [];
    if (allRefs.length > 0) {
        extracted.docNumber = allRefs[0];
        extracted.references = allRefs.slice(1);
    }
    // ... (rest of function) ...
    // Note: This is too big for replace_file. I should just wrap the call in extractFromText or use a smaller modification?
    // extractFromText calls extractButo. I'll modify extractFromText to catch errors from extractButo?
    // No, I want to know WHERE in extractButo it fails.

    // ValidateAndPush?

    // Let's assume the error is in the new code: Totals or Finalize.



    // --- Dates ---
    const issuedMatch = text.match(/FACTURA\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (issuedMatch) {
        extracted.dates.issued = normalizeDate(issuedMatch[1]);
    }
    if (/Pagado/i.test(text.substring(0, 1000))) {
        extracted.paymentStatus = 'paid';
    }

    // --- Entities ---
    if (/BUTO\s+DESIGN\s+S\.L\./i.test(text)) {
        extracted.entities.supplier.name = "BUTO DESIGN S.L.";
        const supVat = text.match(/(?:ES)?B02883957/);
        if (supVat) extracted.entities.supplier.vat = supVat[0];
        extracted.entities.supplier.address = "Alicante, Spain";
    }

    const clienteMatch = text.match(/CLIENTE\s*\n(.+)/);
    if (clienteMatch) {
        extracted.entities.customer.name = clienteMatch[1].trim();
    }
    const ptVat = text.match(/\bPT(\d{9})\b/);
    if (ptVat) {
        extracted.entities.customer.vat = 'PT' + ptVat[1];
    }

    // --- C) Totals ---
    const getVal = (re) => {
        const m = text.match(re);
        return m ? normalizeAmount(m[1]) : null;
    }

    // 1. Goods (Total Bruto)
    extracted.totals.goods = getVal(/Total Bruto\s*[:\.]?\s*([\d\.]+,\d{2})/i);

    // 2. Discounts
    let discMain = getVal(/Total Descuento\s*[:\.]?\s*(-?[\d\.]+,\d{2})/i);
    // Dto Adicional (Amount)
    let discExtra = getVal(/Dto\. Adicional[^\n]*\s*[:\.]?\s*(-?[\d\.]+,\d{2})/i);

    extracted.totals.discountMain = discMain;
    extracted.totals.discountExtra = discExtra;

    // Total Discount (sum of absolutes)
    const absDiscMain = discMain ? Math.abs(discMain) : 0;
    const absDiscExtra = discExtra ? Math.abs(discExtra) : 0; // Will update later if calc needed
    if (absDiscMain || absDiscExtra) {
        extracted.totals.discount = parseFloat((absDiscMain + absDiscExtra).toFixed(2));
    }

    let base = getVal(/Base imponible\s+([\d\.]+,\d{2})/i);
    let grand = getVal(/Total \(€\)\s+([\d\.]+,\d{2})/i);

    if (base) extracted.totals.subtotal = base;
    if (grand) extracted.totals.total = grand;

    if (!extracted.totals.tax) {
        if (!grand && base) extracted.totals.total = base;
        if (!base && grand) extracted.totals.subtotal = grand;
        if (text.includes('exempt from VAT') || (extracted.totals.subtotal && extracted.totals.total && Math.abs(extracted.totals.subtotal - extracted.totals.total) < 0.05)) {
            extracted.totals.tax = 0;
        }
    }

    // --- B) Line Parsing (Dynamic Right-to-Left Strategy) ---
    // Removed \b to allow matching merged money (e.g. "OLDM12350700,00")
    const moneyRegex = /((?:\d{1,3}(?:\.\d{3})+)(?:,\d{2})?|(?:\d+(?:,\d{2})))/g;

    const lines = text.split('\n');
    let startIdx = 0;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('DESCRIPCIÓN') && lines[i].includes('TOTAL') && lines[i].includes('DTO.%')) {
            startIdx = i + 1;
        }
        if (lines[i].includes('Resumen')) {
            endIdx = i;
            break;
        }
    }

    for (let i = startIdx; i < endIdx; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        const moneyMatches = [...line.matchAll(moneyRegex)];

        if (moneyMatches.length >= 2) {
            // Process matches from Right to Left
            let mIdx = moneyMatches.length - 1;
            let prevMatchEnd = 0;
            // Since we go backwards, "prevMatchEnd" is from the LEFT side perspective, 
            // but we need to track the gap between current Item Start and previous Item End.
            // Triplet Strategy:
            // 3 matches: Unit, Gross, Net
            // 2 matches: Unit (implicitly Gross), Net

            // We need to group valid sets.
            // Loop backwards
            const rowParams = [];

            while (mIdx >= 1) {
                // Peek potential triplet
                let mNet, mGross, mUnit;
                let used = 0;

                // Prefer 3 if available and valid?
                if (mIdx >= 2) {
                    mNet = moneyMatches[mIdx];
                    mGross = moneyMatches[mIdx - 1];
                    mUnit = moneyMatches[mIdx - 2];

                    // Helper: check if mUnit is ridiculously close to mGross? No.
                    used = 3;
                } else {
                    // Only 2 left
                    mNet = moneyMatches[mIdx];
                    mGross = moneyMatches[mIdx - 1];
                    mUnit = mGross; // Implicit
                    used = 2;
                }

                rowParams.unshift({ mUnit, mGross, mNet, used });
                mIdx -= used;
            }

            // Now process rowParams forward to handle Descriptions/Codes correctly
            let leftBoundary = 0;

            for (const row of rowParams) {
                const { mUnit, mGross, mNet, used } = row;

                const unitPrice = normalizeAmountButo(mUnit[0]);
                const grossTotal = normalizeAmountButo(mGross[0]);
                const total = normalizeAmountButo(mNet[0]);

                // Indices
                const unitStart = mUnit.index;
                const netIndex = mNet.index;

                // Extract description/UD/code found between leftBoundary and unitStart
                const preUnit = line.substring(leftBoundary, unitStart).trim();

                // Update boundary for next row
                leftBoundary = netIndex + mNet[0].length;

                // INC
                let incrementPercent = 0;
                if (used === 3) {
                    const textInc = line.substring(mUnit.index + mUnit[0].length, mGross.index);
                    const incMatch = textInc.match(/(\d+)/);
                    if (incMatch) incrementPercent = parseInt(incMatch[1], 10);
                }

                // DTO
                let discountPercent = 0;
                const startDto = (used === 3) ? (mGross.index + mGross[0].length) : (mUnit.index + mUnit[0].length);
                const textDto = line.substring(startDto, mNet.index);
                const dtoMatch = textDto.match(/(\d+(?:,\d+)?)/);
                if (dtoMatch) discountPercent = parseFloat(dtoMatch[1].replace(',', '.'));

                // UD/Code/Desc
                let quantity = 1;
                let code = null;
                let description = "";

                const tokens = preUnit.split(/\s+/);
                let tIdx = 0;

                if (tIdx < tokens.length && /^\d+$/.test(tokens[tIdx])) {
                    quantity = parseInt(tokens[tIdx], 10);
                    tIdx++;
                }

                if (tIdx < tokens.length) {
                    code = tokens[tIdx];
                    tIdx++;
                }

                description = tokens.slice(tIdx).join(' ');

                // --- Move OLD* to Code ---
                // Regex: Starts with OLD... (e.g. OLDG, OLDM, OLDUNICO)
                // e.g. "OLDG-F3/S1M GALIANO..." -> oldToken="OLDG-F3/S1M", restDesc="GALIANO..."

                let detailCode = null;

                // Allow match if it's the ONLY thing in string (optional space + rest)
                const oldMatch = description.match(/^(OLD[^\s]*)(\s+(.*))?$/i);
                if (oldMatch) {
                    const oldToken = oldMatch[1];
                    const restDesc = oldMatch[3] || ''; // Group 3 is the rest (nested in Group 2)

                    // 1. Update Code: <base> OLD
                    const baseCode = code ? code.trim() : "";
                    if (!/\bOLD\b/i.test(baseCode)) {
                        code = baseCode ? `${baseCode} OLD` : "OLD";
                    }

                    // 2. Extract Detail Code (after first dash)
                    // If contains "-", take suffix. Else null.
                    const dashIdx = oldToken.indexOf('-');
                    if (dashIdx >= 0 && dashIdx < oldToken.length - 1) {
                        detailCode = oldToken.slice(dashIdx + 1).trim();
                    }

                    description = restDesc;
                }

                const lineObj = {
                    code,
                    detailCode,
                    description,
                    quantity,
                    unitPrice,
                    incrementPercent,
                    discountPercent,
                    grossTotal,
                    total
                };

                validateAndPush(extracted.lines, lineObj);
            }

            // Post-row description
            const remainder = line.substring(leftBoundary).trim();
            if (remainder && extracted.lines.length > 0) {
                const last = extracted.lines[extracted.lines.length - 1];
                if (!isLegalText(remainder)) {
                    last.description += ' ' + remainder;
                }
            }

        } else {
            // Continuation line (text wrap)
            if (extracted.lines.length > 0) {
                const last = extracted.lines[extracted.lines.length - 1];
                if (!isLegalText(line)) {
                    if (line.match(/^(Madera|Acabado|Material)/i)) {
                        last.finishText = (last.finishText ? last.finishText + ' ' : '') + line;
                    } else {
                        last.description += ' ' + line;
                    }
                }
            }
        }
    }

    return finalizeButo(extracted, text);
}

// --- Final Validation Block ---
// Helper to be called before returning
function finalizeButo(extracted, text) {
    // Helper Rounding
    const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    // 0. Compute Line Sums
    const stats = extracted.lines.reduce((acc, l) => {
        const gross = l.quantity * l.unitPrice * (1 + (l.incrementPercent || 0) / 100);
        acc.sumLineGross += gross;
        acc.sumLineNet += (l.total || 0);
        return acc;
    }, { sumLineGross: 0, sumLineNet: 0 });

    stats.sumLineGross = round2(stats.sumLineGross);
    stats.sumLineNet = round2(stats.sumLineNet);

    console.log("DEBUG_CALC: SumGross:", stats.sumLineGross, "SumNet:", stats.sumLineNet);

    // 1. Goods (Total Bruto) Fallback
    // If missing or suspicious (e.g. 0), use SumLineGross
    if (!extracted.totals.goods) {
        extracted.totals.goods = stats.sumLineGross;
    }

    // 2. Discount Extra Cleanup & Fallback
    // Bug Fix: Regex sometimes catches 'Total Bruto' (3262) as DiscountExtra.
    if (extracted.totals.discountExtra && extracted.totals.discountExtra === extracted.totals.goods) {
        console.log("DEBUG_FIX: Cleared suspect DiscountExtra (matched goods)");
        extracted.totals.discountExtra = null;
    }

    // Attempt % calc if null
    if (extracted.totals.discountExtra === null) {
        const matchPct = text.match(/Dto\. Adicional.*?(\d+(?:[\.,]\d+)?)%/i);
        if (matchPct) {
            const pct = parseFloat(matchPct[1].replace(',', '.'));
            const extraCalc = stats.sumLineNet * (pct / 100);
            extracted.totals.discountExtra = round2(extraCalc);
            console.log("DEBUG_CALC: Calc Extra via %:", extraCalc);
        }
    }

    // Attempt inference from Subtotal
    // Subtotal = SumLineNet - DiscountExtra
    // DiscountExtra = SumLineNet - Subtotal
    if (extracted.totals.discountExtra === null && extracted.totals.subtotal) {
        const inferred = stats.sumLineNet - extracted.totals.subtotal;
        if (inferred > 0.01) { // Tolerance
            extracted.totals.discountExtra = round2(inferred);
            console.log("DEBUG_CALC: Inferred Extra via Subtotal:", inferred);
        }
    }

    // 3. Discount Main Fallback
    // Main = Goods - SumLineNet
    if (!extracted.totals.discountMain && extracted.totals.goods) {
        const inferredMain = extracted.totals.goods - stats.sumLineNet;
        // Only valid if positive
        if (inferredMain > -0.01) {
            extracted.totals.discountMain = round2(inferredMain);
        }
    }

    // 4. Update Final Total Discount
    const dMain = Math.abs(extracted.totals.discountMain || 0);
    const dExtra = Math.abs(extracted.totals.discountExtra || 0);
    if (dMain || dExtra) {
        extracted.totals.discount = round2(dMain + dExtra);
    }

    // 5. Final Consistency Check (Review Flag)
    if (extracted.totals.subtotal) {
        const expectedSub = stats.sumLineNet - (extracted.totals.discountExtra || 0);
        if (Math.abs(expectedSub - extracted.totals.subtotal) > 0.1) {
            extracted.needsReview = true;
            extracted.reviewReason = `SubtotalMismatch(Exp:${expectedSub.toFixed(2)} vs Found:${extracted.totals.subtotal})`;
        }
    }

    return extracted;
}

function isLegalText(text) {
    if (!text) return false;
    if (text.includes('Inscrita') || text.includes('Registro Merkantil') || text.includes('Datos Registrales')) return true;
    return false;
}

function validateAndPush(linesArr, line) {
    let { quantity, unitPrice, incrementPercent, discountPercent, total, grossTotal } = line;

    // Multipliers
    const incMult = 1 + (incrementPercent || 0) / 100;
    const dtoMult = 1 - (discountPercent || 0) / 100;

    // Initial Expectation
    let expectedGross = quantity * unitPrice * incMult;
    let expectedNet = expectedGross * dtoMult;

    // Validation Issue detection
    let netDiff = Math.abs(expectedNet - total);

    // Self-Correction for Merged Prices (e.g. 111720 instead of 1720)
    // Trigger if Net Mismatch is significant and UnitPrice is suspiciously large
    if (netDiff > 0.5 && unitPrice > 10000) {
        // Attempt to derive correct Price from NET Total (which is usually reliable)
        // Net = Qty * Price * Inc * Dto
        // Price = Net / (Qty * Inc * Dto)

        const divisor = quantity * incMult * dtoMult;
        if (divisor > 0) {
            const estimatedPrice = total / divisor;

            // Fuzzy check: does huge unitPrice end with estimatedPrice?
            const priceStr = Math.round(unitPrice).toString();
            const estStr = Math.round(estimatedPrice).toString();

            // Allow close matches (suffix)
            if (priceStr.endsWith(estStr) && (unitPrice / estimatedPrice > 10)) {
                // Matched! Apply Correction.
                line.unitPrice = parseFloat(estimatedPrice.toFixed(2));

                // If Gross was same as Price (Pair logic), update meaningful Gross too
                if (grossTotal === unitPrice) {
                    line.grossTotal = parseFloat((line.unitPrice * incMult).toFixed(2));
                    grossTotal = line.grossTotal;
                }

                // Update local variables for re-validation
                unitPrice = line.unitPrice;
                expectedGross = quantity * unitPrice * incMult;
                expectedNet = expectedGross * dtoMult;
                netDiff = Math.abs(expectedNet - total);

                // Add a note? No, clean correction desired.
            }
        }
    }

    let issue = null;

    // Final Validation Check (Tolerance 0.1)
    if (netDiff > 0.1) {
        issue = `NetMismatch(Exp:${expectedNet.toFixed(2)} vs Found:${total})`;
    }

    // Check Gross if independent (Triplet) or Updated
    if (grossTotal && Math.abs(expectedGross - grossTotal) > 0.1) {
        issue = (issue ? issue + ' ' : '') + `GrossMismatch(Exp:${expectedGross.toFixed(2)} vs Found:${grossTotal})`;
    }

    if (issue) {
        line.needsReview = true;
        line.validationIssue = issue;
    } else {
        line.needsReview = false; // Clear if corrected
        delete line.validationIssue;
    }

    delete line.grossTotal; // Cleanup
    linesArr.push(line);
}

module.exports = extractButo;

function extractButo(text) {
    try {
        return extractButoInternal(text);
    } catch (e) {
        console.error("BUTO CRASH:", e);
        return {
            error: e.message,
            stack: e.stack,
            docNumber: null,
            dates: { issued: null, due: null },
            totals: {},
            lines: [],
            entities: { customer: {}, supplier: {} }
        };
    }
}
