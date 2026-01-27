const classifyDocType = require('./classifyDocType');
const extractFromText = require('./extractFromText');
// const normalize = require('./normalize'); // Used inside extractFromText
const validate = require('./validate');

const nicolazziCoords = require('./nicolazziInvoiceCoordsExtraction');

async function process(text, pdfBuffer) {
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

    // 1. Classify
    const docType = classifyDocType(text);

    // 2. Extract
    // Gating for Nicolazzi Coords
    let extractedData = null;

    // Strict Gating: Must be Nicolazzi AND (Invoice OR Proforma) AND have buffer
    if (pdfBuffer && /NICOLAZZI/i.test(text) && (/Fattura|Invoice/i.test(text)) && !/Proforma/i.test(text)) {
        try {
            console.log("[Engine] Attempting Nicolazzi Coords Extraction...");
            extractedData = await nicolazziCoords(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] Coords Extraction Successful.");
            } else {
                console.log("[Engine] Coords Extraction returned null (Grid not found? process fallback).");
            }
        } catch (e) {
            console.error("[Engine] Coords Extraction Error:", e);
        }
    }

    // Gating for Ritmonio Confirmation Coords
    if (!extractedData && pdfBuffer && /Ritmonio/i.test(text) && (/CONFERMA D'ORDINE|ORDER CONFIRMATION/i.test(text))) {
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
    if (!extractedData && pdfBuffer && /Ritmonio/i.test(text) && (/Fattura|Invoice|FA5/i.test(text)) && !/CONFERMA|CONFIRMATION/i.test(text)) {
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
        extractedData = extractFromText(text);
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
        dates: extractedData.dates,
        entities: extractedData.entities,
        totals: extractedData.totals,
        lines: extractedData.lines,
        docRefs: extractedData.docRefs,

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
