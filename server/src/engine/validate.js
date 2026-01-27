function validate(extracted, docType) {
    const minConfidence = 0.5;
    let confidence = 0.7; // Lower baseline, earned through completeness
    let needsReview = false;
    let reviewReason = [];

    // 1. Completeness Checks
    if (!docType) {
        needsReview = true;
        reviewReason.push("Unknown Document Type");
        confidence = 0.2;
    } else {
        if (extracted.docNumber) confidence += 0.1;
        else { needsReview = true; reviewReason.push("Missing Document Number"); }

        if (extracted.entities.customer.vat) confidence += 0.05;
        if (extracted.entities.supplier.vat) confidence += 0.02;
    }

    // 2. Mathematical Consistency (Lines vs Subtotal)
    const t = extracted.totals;
    let mathOk = true;

    if (extracted.lines.length > 0) {
        confidence += 0.05;
        const sumLines = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
        if (t.subtotal && Math.abs(sumLines - t.subtotal) < 0.1) {
            confidence += 0.05;
            debugLog("Line sum matches subtotal");
        } else if (t.subtotal) {
            mathOk = false;
            debugLog(`Line sum (${sumLines}) != Subtotal (${t.subtotal})`);
        }
    } else if (docType === 'invoice') {
        needsReview = true;
        reviewReason.push("No Lines Extracted");
    }

    // 3. Mathematical Consistency (Subtotal + Tax vs Total)
    if (t.total && t.subtotal) {
        const discountVal = (t.discount || 0);
        const transportVal = (t.transport || 0);
        const taxVal = (t.tax || 0);

        // Sum check: Subtotal + Transport - Discount + Tax = Total
        const calcTotal = (t.subtotal + transportVal - discountVal + taxVal);
        if (Math.abs(calcTotal - t.total) < 0.1) {
            confidence += 0.05;
            debugLog("Totals are mathematically consistent");
        } else {
            mathOk = false;
            reviewReason.push("Totals Mismatch (Subtotal + Transport - Disc + Tax != Total)");
        }
    } else {
        mathOk = false;
        reviewReason.push("Missing Totals");
    }

    // 4. Reference completeness
    if (extracted.docRefs && (extracted.docRefs.deliveryNote || extracted.docRefs.orderConfirmation)) {
        confidence += 0.02;
    }

    // High Quality Bonus: If math is perfect and we have lines
    if (mathOk && extracted.lines.length > 0 && !needsReview) {
        confidence += 0.1;
    }

    function debugLog(msg) { /* console.log('[Validator]', msg); */ }

    // Final Review Gate
    if (confidence < minConfidence) needsReview = true;
    if (mathOk === false) needsReview = true;

    return {
        confidence: parseFloat(Math.min(0.99, confidence).toFixed(2)),
        needsReview,
        reviewReason: reviewReason.join(', ') || null
    };
}

module.exports = validate;
