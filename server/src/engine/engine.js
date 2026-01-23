const classifyDocType = require('./classifyDocType');
const extractFromText = require('./extractFromText');
// const normalize = require('./normalize'); // Used inside extractFromText
const validate = require('./validate');

async function process(text) {
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
    const extractedData = extractFromText(text);

    // 3. Normalize (Already done inside extractFromText for specific fields, 
    // but we can add global normalization here if needed)

    // 4. Validate
    const validation = validate(extractedData, docType);

    // 5. Assemble Final Object (Canonical Shape)
    const normalized = {
        docType: docType || 'other',
        docNumber: extractedData.docNumber,
        currency: 'EUR', // Assumption for V2
        dates: extractedData.dates,
        entities: extractedData.entities,
        totals: extractedData.totals,
        lines: extractedData.lines,

        confidence: validation.confidence,
        needsReview: validation.needsReview,
        reviewReason: validation.reviewReason
    };

    return normalized;
}

module.exports = {
    process
};
