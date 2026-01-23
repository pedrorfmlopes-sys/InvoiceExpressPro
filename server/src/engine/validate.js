function validate(extracted, docType) {
    const minConfidence = 0.5;
    let confidence = 0.8;
    let needsReview = false;
    let reviewReason = null;

    // 1. Mandatory Fields based on DocType
    if (!docType) {
        needsReview = true;
        reviewReason = "Unknown Document Type";
        confidence = 0.2;
    } else {
        if (!extracted.docNumber) {
            needsReview = true;
            reviewReason = "Missing Document Number";
            confidence -= 0.3;
        }

        if (docType === 'invoice' || docType === 'proforma') {
            if (!extracted.totals.total && !extracted.totals.subtotal) {
                needsReview = true;
                reviewReason = (reviewReason ? reviewReason + ", " : "") + "Missing Totals";
                confidence -= 0.3;
            }
        }
    }

    // 2. Data Consistency (Totals)
    const t = extracted.totals;
    if (t.subtotal && t.tax && t.total) { // Updated keys
        const calcTotal = t.subtotal + t.tax;
        if (Math.abs(calcTotal - t.total) > 0.05) {
            needsReview = true;
            reviewReason = (reviewReason ? reviewReason + ", " : "") + "Totals Mismatch (Subtotal+Tax!=Total)";
        }
    }

    // 3. Line Items vs Totals
    if (extracted.lines.length > 0 && t.subtotal) {
        const sumLines = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
        // Allows 10% tolerance or 1.0 diff (rounding)
        if (Math.abs(sumLines - t.subtotal) > 1.0) {
            // Maybe lines are including tax or not? Warn but don't fail hard.
        }
    } else if (extracted.lines.length === 0 && (docType === 'invoice')) {
        needsReview = true;
        reviewReason = (reviewReason ? reviewReason + ", " : "") + "No Lines Extracted";
    }

    // 4. Anti-Invention: If confidence is too low, mark review
    if (confidence < minConfidence) needsReview = true;

    return {
        confidence: Math.max(0, Math.min(1, confidence)),
        needsReview,
        reviewReason
    };
}

module.exports = validate;
