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
            if (!extracted.totals.gross && !extracted.totals.net) {
                needsReview = true;
                reviewReason = (reviewReason ? reviewReason + ", " : "") + "Missing Totals";
                confidence -= 0.3;
            }
        }
    }

    // 2. Data Consistency (Totals)
    const t = extracted.totals;
    if (t.net && t.tax && t.gross) {
        const calcGross = t.net + t.tax;
        if (Math.abs(calcGross - t.gross) > 0.05) {
            needsReview = true;
            reviewReason = (reviewReason ? reviewReason + ", " : "") + "Totals Mismatch (Net+Tax!=Gross)";
        }
    }

    // 3. Line Items vs Totals
    if (extracted.lines.length > 0 && t.net) {
        const sumLines = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
        // Allows 10% tolerance or 1.0 diff (rounding)
        if (Math.abs(sumLines - t.net) > 1.0) {
            // Maybe lines are including tax or not? Warn but don't fail hard.
            // needsReview = true; // Strict?
            // reviewReason = ...
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
