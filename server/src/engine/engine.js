const classifyDocType = require('./classifyDocType');
const extractFromText = require('./extractFromText');
// const normalize = require('./normalize'); // Used inside extractFromText
const validate = require('./validate');
const { pdfBufferToTextPoppler } = require('../utils/popplerText');

const nicolazziCoords = require('./nicolazziInvoiceCoordsExtraction');
const nicolazziProforma = require('./nicolazziProformaTableExtraction');

async function process(text, pdfBuffer) {
    let effectiveText = text;

    // 0. Pre-check
    if (!text || text.length < 50) {
        return {
            docType: null,
            extracted: {},
            normalization: {
                confidence: 0,
                needsReview: true,
                reviewReason: "No text extracted (OCR required)"
            }
        };
    }

    // 1. High Fidelity Text Support (Nicolazzi / Ritmonio)
    if (pdfBuffer && (/NICOLAZZI/i.test(text) || /Ritmonio/i.test(text))) {
        try {
            const popplerText = await pdfBufferToTextPoppler(pdfBuffer); // Ensure await if async, usually is promise
            if (popplerText && popplerText.length > 100) {
                effectiveText = popplerText;
            }
        } catch (e) {
            console.warn("[Engine] Poppler re-extraction failed, using original text.", e.message);
        }
    }

    // 2. Classify
    const docType = classifyDocType(effectiveText);

    // 3. Extract
    // Gating for Nicolazzi Coords
    let extractedData = null;

    // A. Nicolazzi Proforma (Text/Poppler Based)
    // Inclusive regex for variations: Proforma, Pro-forma, Pro forma, etc.
    const isProforma = /Pro[\s-]*forma/i.test(effectiveText);

    if (/NICOLAZZI/i.test(effectiveText) && isProforma) {
        try {
            console.log("[Engine] Attempting Nicolazzi Proforma Extraction...");
            extractedData = nicolazziProforma(effectiveText);
            if (extractedData) {
                console.log("[Engine] Nicolazzi Proforma Extraction Successful.");
                // Ensure docType is 'proforma' for frontend routing
                extractedData.docType = 'proforma';
            }
        } catch (e) {
            console.error("[Engine] Nicolazzi Proforma Extraction Error:", e);
        }
    }

    // B. Strict Gating for Invoices: Must be Nicolazzi AND (Invoice/Fattura) AND NOT any Proforma variation
    if (!extractedData && /NICOLAZZI/i.test(effectiveText) && (/Fattura|Invoice/i.test(effectiveText)) && !isProforma) {
        try {
            console.log("[Engine] Attempting Nicolazzi Invoice Table Extraction (New)...");
            // Load the new extractor dynamically
            const nicolazziInvoiceTable = require('./nicolazziInvoiceTableExtraction');
            extractedData = nicolazziInvoiceTable(effectiveText);

            if (extractedData) {
                console.log("[Engine] Nicolazzi Invoice Table Extraction Successful.");
                // Ensure docType is 'invoice'
                extractedData.docType = 'invoice';
            }
        } catch (e) {
            console.error("[Engine] Nicolazzi Invoice Extraction Error:", e);
        }
    }

    // Gating for Ritmonio Confirmation Coords
    if (!extractedData && pdfBuffer && /Ritmonio/i.test(effectiveText) && (/CONFERMA D'ORDINE|ORDER CONFIRMATION/i.test(effectiveText))) {
        try {
            const ritmonioConf = require('./ritmonioConfirmationExtraction');
            console.log("[Engine] Attempting Ritmonio Confirmation Extraction...");
            extractedData = await ritmonioConf(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] Ritmonio Confirmation Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] Ritmonio Confirmation Extraction Error:", e);
        }
    }

    // Gating for Ritmonio Coords (Invoices)
    if (!extractedData && pdfBuffer && /Ritmonio/i.test(effectiveText) && (/Fattura|Invoice|FA5/i.test(effectiveText)) && !/CONFERMA|CONFIRMATION/i.test(effectiveText)) {
        try {
            const ritmonioCoords = require('./ritmonioInvoiceExtraction');
            console.log("[Engine] Attempting Ritmonio Coords Extraction...");
            extractedData = await ritmonioCoords(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] Ritmonio Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] Ritmonio Extraction Error:", e);
        }
    }

    // Fallback to Text Extractor
    if (!extractedData) {
        extractedData = extractFromText(effectiveText);
    }

    // 3. Normalize (Already done inside extractFromText for specific fields, 
    // but we can add global normalization here if needed)

    // 4. Validate
    const validation = validate(extractedData, docType);

    // 5. Assemble Final Object (Canonical Shape)
    const normalized = {
        docType: extractedData.docType || docType || 'other',
        docNumber: extractedData.docNumber,
        currency: 'EUR', // Assumption for V2
        date: extractedData.dates?.issued || extractedData.date, // [CRITICAL FIX] Map for Viewer
        dates: extractedData.dates,
        entities: extractedData.entities,
        totals: extractedData.totals,
        lines: extractedData.lines,
        docRefs: extractedData.docRefs,
        projectRef: extractedData.projectRef, // [NEW] Pass through Project Ref
        shippingMarks: extractedData.shippingMarks, // [CRITICAL FIX] Pass through Shipping Marks

        confidence: validation.confidence,
        needsReview: validation.needsReview,
        reviewReason: validation.reviewReason,

        debug: {
            // Preserve existing debug info from extractors (e.g. markers)
            ...(extractedData.debug || {}),
            textLength: text.length,
            textSample: text.substring(0, 1000)
        }
    };

    return normalized;
}

module.exports = {
    process
};
