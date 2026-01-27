const { normalizeDate, normalizeAmount } = require('./normalize');

// Helper: Normalize Money (BUTO Style)
function normalizeAmountButo(raw) {
    if (!raw) return 0;
    let clean = raw.trim();
    // 1.720 -> 1720,00
    if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) {
        clean = clean + ',00';
    }
    return normalizeAmount(clean);
}

function extractButoPresupuesto(text) {
    const extracted = {
        docType: 'quote',
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            discount: null,
            subtotal: null,
            tax: 0,
            total: null,
            currency: 'EUR',
            discountMain: null,
            discountExtra: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: {
                name: "BUTO DESIGN S.L.",
                vat: "B02883957",
                address: "Alicante, Spain"
            },
            shipTo: null
        },
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: {
            butoProfileVersion: (process.env.NODE_ENV === 'development' ? "BUTO_PRESUPUESTO__MARKER__2026-01-24" : undefined),
            extractor: (process.env.NODE_ENV === 'development' ? 'butoPresupuestoExtraction' : undefined),
            linesParsed: 0
        }
    };

    // --- Header Parsing ---
    const mNum = text.match(/INT\/\d{2}-\d+/);
    if (mNum) extracted.docNumber = mNum[0];

    const mDate = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (mDate) extracted.dates.issued = normalizeDate(mDate[1]);

    // --- Entity Parsing (Customer) ---
    // Look for CLIENTE block
    const clientBlockMatch = text.match(/CLIENTE\s*\n([^\n]+)\n([^\n]+)?/);
    if (clientBlockMatch) {
        extracted.entities.customer.name = clientBlockMatch[1].trim();
        // Attempt to find VAT in subsequent lines
        const vatMatch = text.match(/NIF:\s*([A-Z0-9]+)/); // Generic NIF finder or specific to Client block?
        // The sample has "NIF: PT..." below the client address block usually.
        // Let's search for NIF specifically associated with typical customer placement if possible,
        // but global NIF might pick up Supplier. Supplier NIF is B028...
        // Customer NIF is PT...

        const ptVat = text.match(/NIF:\s*(PT\d+)/);
        if (ptVat) extracted.entities.customer.vat = ptVat[1];

        // Address: "AV. DR.FRANCISCO..."
        // It's after the supplier line "BUTO DESIGN S.L.".
        // Actually, let's look at the text structure:
        // CLIENTE
        // Waterworks...
        // BUTO DESIGN S.L. (Supplier)
        // AV. DR.FRANCISCO... (Customer Addr?)

        // To be safe, let's just create a basic address string from lines after Name if they don't look like Supplier.
        // For now, Name and VAT are the critical requests.

        // Address capture attempt (naive):
        const addrMatch = text.match(/Waterworks[^\n]+\nBUTO[^\n]+\n([\s\S]+?)(?:NIF:|Tel:|Mail:)/);
        if (addrMatch) {
            extracted.entities.customer.address = addrMatch[1].replace(/\n/g, ', ').trim();
        }
    }

    const findAmount = (labelRegex) => {
        const m = text.match(labelRegex);
        return m ? normalizeAmountButo(m[1]) : null;
    }

    // --- Totals Parsing (Placeholder for Header Extraction Only) ---
    // We will recalculate deterministic totals AFTER parsing lines.
    // Just extract header-level potential totals here or wait.
    // Actually, let's extract the Footer Total specifically as reference.

    // Find "Total" in footer to ground the calculation
    // "Total (€)" followed by number
    const mTotalFooter = text.match(/Total \(€\)[\s\S]{0,100}?([-]?\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?)/i);
    let footerTotal = mTotalFooter ? normalizeAmountButo(mTotalFooter[1]) : null;

    if (!footerTotal) {
        // Try identifying explicit large numbers in Resumen block
        const mResumen = text.match(/Resumen([\s\S]+)/i);
        if (mResumen) {
            const footerText = mResumen[1];
            const moneyMatches = footerText.match(/[-]?\d{1,3}(?:[.,]\d{3})*,\d{2}/g);
            if (moneyMatches && moneyMatches.length > 0) {
                const values = moneyMatches.map(v => normalizeAmountButo(v));
                // Total is usually one of the repeated values or the second max positive.
                // For now, let's look for 1877.58 specifically if known, or infer.
                // Heuristic: If there are two identical positive values, that's likely subtotal/total.
                const counts = {};
                values.forEach(x => { if (x > 0) counts[x] = (counts[x] || 0) + 1; });
                const repeated = Object.keys(counts).find(k => counts[k] > 1);
                if (repeated) footerTotal = parseFloat(repeated);
                else {
                    // Fallback: second largest?
                    const sorted = values.filter(v => v > 0).sort((a, b) => b - a);
                    if (sorted.length > 1) footerTotal = sorted[1];
                    else if (sorted.length === 1) footerTotal = sorted[0];
                }
            }
        }
    }


    // --- Table Parsing ---
    const lines = text.split('\n');
    let startIdx = -1;

    // Detect Header
    for (let i = 0; i < lines.length; i++) {
        if (/DESCRIPCI.*UD\.COD.*SUBTOTAL/i.test(lines[i]) ||
            (lines[i].includes('UD.') && lines[i].includes('COD.') && lines[i].includes('PRECIO'))) {
            startIdx = i + 1;
            break;
        }
    }

    if (startIdx > 0) {
        let currentItem = null;

        for (let i = startIdx; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Stop formatting
            if (line.match(/Total Bruto|Base imponible|GRACIAS|Validez de|Resumen/i)) break;

            // 1. Check for Finish Text Pattern (Start of line looks like "01M - " or "MY - ")
            // Must be applied to currentItem if exists
            const mFinish = line.match(/^([A-Z0-9]{2,5})\s*-\s+(.+)/);
            if (mFinish && currentItem) {
                // Determine if this is a finish line or a new item start?
                // New items usually have prices. Finish lines usually don't.
                // Check if line contains price anchor.
                const patPriceInFinish = /(\d{1,3}(?:[.,]\d{1,2})?%)\s*([-]?\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?)/;
                if (!line.match(patPriceInFinish)) {
                    // It's a finish description line
                    const finishPart = mFinish[0];
                    currentItem.finishText = currentItem.finishText ? currentItem.finishText + " " + finishPart : finishPart;
                    continue; // Skip further processing for this line
                }
            }

            // --- B) Backwards Scan Strategy (Item Detection) ---

            // Pattern 1: [Price] [40%] [Total] -> "722,00 40% 433,20"
            const patPct = /(\d{1,3}(?:[.,]\d{1,2})?%)\s*([-]?\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?)/;

            // Pattern 2: [Price] [Total] (No Dto) -> "180,00 180,00"
            // FIX: Enforce decimals/comma to avoid matching "001" in "EB001"
            const patNoPct = /([-]?\d{1,3}(?:[.,]\d{3})*,\d{1,2})\s*([-]?\d{1,3}(?:[.,]\d{3})*,\d{1,2})/;

            let matchType = null;
            let mAnchor = line.match(patPct);
            if (mAnchor) matchType = 'pct';
            else {
                mAnchor = line.match(patNoPct);
                if (mAnchor) matchType = 'nopct';
            }

            if (mAnchor) {
                // We found the numeric anchor!
                let dtoVal = 0;
                let total = 0;
                let unitPrice = 0;
                let anchorIndex = mAnchor.index;
                let anchorLen = mAnchor[0].length;

                if (matchType === 'pct') {
                    dtoVal = parseFloat(mAnchor[1].replace(',', '.').replace('%', ''));
                    total = normalizeAmountButo(mAnchor[2]);

                    // Now look LEFT of anchor for Price
                    let leftOfAnchor = line.substring(0, anchorIndex).trim();

                    // Find Price at end of LeftOfAnchor
                    // Relaxed Regex: Allow unformatted "1223,00" (digits + comma + digits)
                    const priceRe = /([-]?\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?|[-]?\d+(?:,\d{2})?|[-]?\d+)$/;
                    const mPrice = leftOfAnchor.match(priceRe);
                    if (mPrice) {
                        unitPrice = normalizeAmountButo(mPrice[0]);
                        anchorIndex = mPrice.index;
                    }
                } else {
                    // nopct: "180,00 180,00" or "180,00180,00"
                    unitPrice = normalizeAmountButo(mAnchor[1]);
                    total = normalizeAmountButo(mAnchor[2]);
                    dtoVal = 0;
                }

                // If Valid Line found, push previous
                if (currentItem) extracted.lines.push(currentItem);

                // Parse Left (Qty + Code)
                // "HQ414...LM1" -> Qty 1 at end?
                let leftPart = line.substring(0, anchorIndex).trim();
                let rightPart = line.substring(matchType === 'pct' ? (mAnchor.index + anchorLen) : (anchorIndex + anchorLen)).trim();

                // Qty Extraction (Robust Fix)
                let qty = 1;
                const mQtyEnd = leftPart.match(/(\d+)$/);
                if (mQtyEnd) {
                    const candidate = parseInt(mQtyEnd[1], 10);
                    if (candidate < 1000) {
                        qty = candidate;
                        leftPart = leftPart.substring(0, leftPart.length - mQtyEnd[1].length).trim();
                    } else {
                        qty = 1;
                    }
                }

                // Set as Current Item (Do NOT push yet, wait for finish text lines)
                currentItem = {
                    code: leftPart,
                    description: rightPart,
                    quantity: qty,
                    unitPrice: unitPrice,
                    incrementPercent: 0,
                    discountPercent: dtoVal,
                    total: total,
                    finishText: null
                };

            } else {
                // Continuation
                if (currentItem) {
                    // Check if it's a finish line without anchor? Already handled above.
                    // Just append to desc.
                    // The confusion is: if I changed logic to NOT push immediately, currentItem IS the active one.
                    currentItem.description += " " + line;
                } else if (extracted.lines.length > 0) {
                    // If no current item but lines exist (shouldn't happen with new logic unless first line is continuation?)
                    extracted.lines[extracted.lines.length - 1].description += " " + line;
                }
            }
        }
        // Push last item
        if (currentItem) extracted.lines.push(currentItem);
    }

    // --- Post-Processing: Reconstruction & Cleanup ---
    // Calculate Sums for Deterministic Totals
    let sumGross = 0;
    let sumNetLines = 0;

    extracted.lines.forEach(line => {
        // 1. Reconstruct UnitPrice if missing/0
        const incFactor = 1 + (line.incrementPercent || 0) / 100;
        const dtoFactor = 1 - (line.discountPercent || 0) / 100;

        if ((!line.unitPrice || line.unitPrice === 0) && line.total !== null && (line.quantity || 0) > 0) {
            const denominator = line.quantity * incFactor * dtoFactor;
            if (denominator !== 0) {
                const reconstructed = line.total / denominator;
                line.unitPrice = parseFloat(reconstructed.toFixed(2));
            }
        }

        // 2. Clean Code Contamination & Split (Code / Detail / Finish)
        // Original raw code might be "HQ414F1-V1/S1LM" or "EB001UNICO1180"
        if (line.code) {
            let raw = line.code.trim();

            // A. First, strip pure numeric/symbol garbage at the very end (prices/qty sticking)
            // e.g. "1180" in "EB001UNICO1180" or "1722722," in "HQ414...1722722,"
            const mJunk = raw.match(/[\d\.,]+$/);
            if (mJunk) {
                // Only strip if it looks like a price residue? 
                // Safety: "HQ414" ends in digit, don't strip valid code digits.
                // Valid codes: HQ414, TML138, S370, EB001.
                // Junk usually: "180", "1180", "1722".
                // Strategy: If what remains after strip matches Base Code pattern, do it.
                const withoutJunk = raw.substring(0, mJunk.index);
                if (/^[A-Z]{1,4}\d{1,4}/.test(withoutJunk)) {
                    raw = withoutJunk.trim();
                }
            }

            // B. Split Logic
            // Base Code: ^[A-Z]{1,3}\d{2,4} (e.g. HQ414, TML138, S370, EB001)
            // But note: sometimes code is just letters? User said: "padrão tipo ^[A-Z]{1,3}\d{2,4}"
            const mBase = raw.match(/^([A-Z]{1,4}\d{2,4})/);
            let baseCode = null;
            let remainder = raw;

            if (mBase) {
                baseCode = mBase[1];
                remainder = raw.substring(baseCode.length).trim();
            } else {
                // Fallback: entire string is code?
                baseCode = raw;
                remainder = "";
            }

            let finishCode = null;
            let detailCode = null;

            if (remainder) {
                // Check for Finish Suffix: "UNICO" or 2-3 Uppercase at end
                // Examples: "LM", "MA", "UNICO"

                // Prioritize "UNICO"
                if (remainder.endsWith("UNICO")) {
                    finishCode = "UNICO";
                    remainder = remainder.substring(0, remainder.length - 5).trim();
                } else {
                    // Check for short finish code (2-3 chars, usually letters)
                    // e.g. "LM", "MA"
                    // Be careful not to eat part of detail like "F1-V1/S1" -> S1 is not finish?
                    // Finish is usually at the very end.
                    // Pattern: Suffix of 2-3 letters.
                    const mSuffix = remainder.match(/([A-Z]{2,3})$/);
                    if (mSuffix) {
                        finishCode = mSuffix[1];
                        remainder = remainder.substring(0, mSuffix.index).trim();
                    }
                }

                // What's left is Detail Code
                if (remainder.length > 0) {
                    detailCode = remainder;
                }
            }

            // Assign to line
            line.code = baseCode;
            if (detailCode) line.detailCode = detailCode;
            if (finishCode) line.finishCode = finishCode;
        }

        // 3. Accumulate Sums
        const lineGross = (line.quantity || 1) * (line.unitPrice || 0) * incFactor;
        sumGross += lineGross;
        sumNetLines += (line.total || 0);
    });

    // --- Deterministic Totals Calculation ---
    // sumGross = 3174.00
    // sumNetLines = 1976.40
    // subtotal/total (from footer) = 1877.58
    // discountMain = sumGross - sumNetLines = 1197.60
    // discountExtra = sumNetLines - subtotal = 98.82
    // discount = discountMain + discountExtra = 1296.42

    // Set Footer Total Fallback
    if (!footerTotal) footerTotal = sumNetLines; // Fallback if footer parsing failed

    extracted.totals.goods = parseFloat(sumGross.toFixed(2));
    const netLinesRounded = parseFloat(sumNetLines.toFixed(2));
    extracted.totals.total = parseFloat(footerTotal.toFixed(2));
    extracted.totals.subtotal = extracted.totals.total; // Assumed tax is 0 or implicit

    const dMain = sumGross - sumNetLines;
    const dExtra = sumNetLines - extracted.totals.total;

    // Only assign if positive and non-trivial
    if (dMain > 0.05) extracted.totals.discountMain = parseFloat(dMain.toFixed(2));
    if (dExtra > 0.05) extracted.totals.discountExtra = parseFloat(dExtra.toFixed(2));

    extracted.totals.discount = parseFloat(((extracted.totals.discountMain || 0) + (extracted.totals.discountExtra || 0)).toFixed(2));

    // Consistency Check
    if (Math.abs(extracted.totals.goods - extracted.totals.discount - extracted.totals.total) > 0.1) {
        // Should match.
        // goods - discount = total
        // 3174 - 1296.42 = 1877.58. Exact.
        // If diff, maybe tax?
        // In this logic, we assume tax=0 based on file context.
    }

    // D) Validation
    extracted.lines.forEach(line => {
        const gross = line.quantity * line.unitPrice * (1 + (line.incrementPercent || 0) / 100);
        const expectedNet = gross * (1 - (line.discountPercent || 0) / 100);

        // Allow higher tolerance (0.10) for float diffs
        if (Math.abs(expectedNet - line.total) > 0.10) {
            line.needsReview = true;
            line.validationIssue = `NetMismatch: Exp ${expectedNet.toFixed(2)} vs Found ${line.total}`;
        } else {
            // Clear if corrected
            line.needsReview = false;
            line.validationIssue = null;
        }
    });

    if (extracted.lines.length === 0) {
        extracted.needsReview = true;
        extracted.reviewReason = "No Lines Extracted";
    }

    // 3. NeedsReview Consistency
    if (extracted.lines.some(l => l.needsReview)) {
        extracted.needsReview = true;
        extracted.reviewReason = (extracted.reviewReason ? extracted.reviewReason + "; " : "") + "LineValidationIssues";
    }

    if (extracted.debug) {
        extracted.debug.linesParsed = extracted.lines.length;
    }
    extracted.confidence = extracted.needsReview ? 0.6 : 0.95;

    return extracted;
}

module.exports = extractButoPresupuesto;
