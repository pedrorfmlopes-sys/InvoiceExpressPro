const extractNicolazziInvoiceTable = require('./nicolazziInvoiceTableExtraction');

function extractNicolazziInvoice(text) {
    // 0. Gating: Reject Proforma explicitly (Safe guard)
    if (/PROFORMA\s+INVOICE/i.test(text)) {
        return {
            docType: 'proforma',
            confidence: 0,
            lines: [],
            totals: {},
            entities: {},
            dates: {},
            needsReview: true,
            reviewReason: 'Proforma detected in Invoice Extractor'
        };
    }

    // Proxy to the new optimizations (Gold Clone)
    const extracted = extractNicolazziInvoiceTable(text);

    // Add debug marker
    if (extracted.debug) extracted.debug.wrapper = 'nicolazziInvoiceExtraction (V2 Proxy)';

    return extracted;
}

module.exports = extractNicolazziInvoice;
