const classifyDocType = require('./classifyDocType');
const extractFromText = require('./extractFromText');
// const normalize = require('./normalize'); // Used inside extractFromText
const validate = require('./validate');
const { pdfBufferToTextPoppler } = require('../utils/popplerText');

const nicolazziCoords = require('./nicolazziInvoiceCoordsExtraction');
const nicolazziProforma = require('./nicolazziProformaTableExtraction');

async function process(text, pdfBuffer) {
    console.log("[Engine] V2.1 Process Started - Category Check Enabled");
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

    // 1. High Fidelity Text Support (Nicolazzi / Ritmonio / Scarabeo)
    if (pdfBuffer && (/NICOLAZZI/i.test(text) || /Ritmonio/i.test(text) || /SCARABEO/i.test(text))) {
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
    if (!extractedData && pdfBuffer && /Ritmonio/i.test(effectiveText) && (/Fattura|Invoice|FA5/i.test(effectiveText))) {
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

    // Gating for AXA Order Confirmation (OC)
    // CRITICAL: Used \b(Ordine|OC)\b to prevent "documento" from triggering "OC"!
    if (!extractedData && pdfBuffer && /AXA|COLAVENE/i.test(effectiveText) && (/\b(Ordine|OC)\b/i.test(effectiveText))) {
        try {
            const axaOrder = require('./axaOrderExtraction');
            console.log("[Engine] Attempting AXA Order Confirmation Extraction...");
            extractedData = await axaOrder.processOrderConfirmation(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] AXA Order Confirmation Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] AXA Order Confirmation Extraction Error:", e);
        }
    }

    // Gating for AXA Proformas
    if (!extractedData && pdfBuffer && /AXA|COLAVENE/i.test(effectiveText) && (/Proforma|Pro-forma/i.test(effectiveText))) {
        try {
            const axaProforma = require('./axaProformaExtraction');
            console.log("[Engine] Attempting AXA Proforma Extraction...");
            extractedData = await axaProforma.processProforma(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] AXA Proforma Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] AXA Proforma Extraction Error:", e);
        }
    }

    // Gating for AXA Invoices (Fattura)
    if (!extractedData && pdfBuffer && /AXA|COLAVENE/i.test(effectiveText) && (/Fattura|Invoice/i.test(effectiveText)) && !(/Proforma|Pro-forma/i.test(effectiveText))) {
        try {
            const axaInvoice = require('./axaInvoiceExtraction');
            console.log("[Engine] Attempting AXA Invoice Extraction...");
            extractedData = await axaInvoice.processInvoice(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] AXA Invoice Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] AXA Invoice Extraction Error:", e);
        }
    }

    // Gating for FIMA Order Confirmation (CONFIRMACION PEDIDO)
    if (!extractedData && pdfBuffer && /FIMA/i.test(effectiveText) && /CONFIRMACION PEDIDO/i.test(effectiveText)) {
        try {
            const fimaOrder = require('./fimaOrderExtraction');
            console.log("[Engine] Attempting FIMA Order Confirmation Extraction...");
            extractedData = await fimaOrder.processOrderConfirmation(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] FIMA Order Confirmation Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] FIMA Order Confirmation Extraction Error:", e);
        }
    }

    // Gating for FIMA Proforma
    if (!extractedData && pdfBuffer && /FIMA/i.test(effectiveText) && /\bPROFORMA\b/i.test(effectiveText) && !/CONFIRMACION PEDIDO/i.test(effectiveText)) {
        try {
            const fimaProforma = require('./fimaProformaExtraction');
            console.log("[Engine] Attempting FIMA Proforma Extraction...");
            extractedData = await fimaProforma.processProforma(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] FIMA Proforma Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] FIMA Proforma Extraction Error:", e);
        }
    }

    // Gating for SCARABEO Invoice (High Priority)
    if (!extractedData && pdfBuffer && /SCARABEO/i.test(effectiveText) && /Covering Invoice/i.test(effectiveText)) {
        try {
            const scarabeoInvoice = require('./scarabeoInvoiceExtraction');
            console.log("[Engine] Attempting SCARABEO Covering Invoice Extraction...");
            extractedData = await scarabeoInvoice.processInvoice(pdfBuffer);
            if (extractedData) {
                extractedData.docType = 'fatura';
                console.log("[Engine] SCARABEO Covering Invoice Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] SCARABEO Covering Invoice Error:", e);
        }
    }

    // Gating for SCARABEO Proforma
    if (!extractedData && pdfBuffer && /SCARABEO/i.test(effectiveText) && /Pro-Forma/i.test(effectiveText)) {
        try {
            const scarabeoProforma = require('./scarabeoProformaExtraction');
            console.log("[Engine] Attempting SCARABEO Proforma Coords Extraction...");
            extractedData = await scarabeoProforma.processProforma(pdfBuffer);
            if (extractedData) {
                extractedData.docType = 'scarabeo_proforma';
                console.log("[Engine] SCARABEO Proforma Coords Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] SCARABEO Proforma Extraction Error:", e);
        }
    }

    // Gating for SCARABEO Invoice (General Fallback)
    if (!extractedData && pdfBuffer && /SCARABEO/i.test(effectiveText) && /Invoice/i.test(effectiveText)) {
        try {
            const scarabeoInvoice = require('./scarabeoInvoiceExtraction');
            console.log("[Engine] Attempting SCARABEO Invoice Coords Extraction (Fallback)...");
            extractedData = await scarabeoInvoice.processInvoice(pdfBuffer);
            if (extractedData) {
                extractedData.docType = 'fatura';
                console.log("[Engine] SCARABEO Invoice Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] SCARABEO Invoice Error:", e);
        }
    }

    // Gating for FIMA Invoice (Factura)
    if (!extractedData && pdfBuffer && /FIMA/i.test(effectiveText) && /Factura/i.test(effectiveText)) {
        try {
            const fimaInvoice = require('./fimaInvoiceExtraction');
            console.log("[Engine] Attempting FIMA Invoice Extraction...");
            extractedData = await fimaInvoice.processInvoice(pdfBuffer);
            if (extractedData) {
                console.log("[Engine] FIMA Invoice Extraction Successful.");
            }
        } catch (e) {
            console.error("[Engine] FIMA Invoice Extraction Error:", e);
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
    if (!extractedData) {
        extractedData = {
            docType: 'other',
            metadata: {},
            entities: { supplier: {}, customer: {} },
            totals: {},
            lines: []
        };
    }

    const normalized = {
        docType: extractedData.docType || docType || 'other',
        docNumber: extractedData.docNumber || extractedData.metadata?.doc_number,
        currency: 'EUR', // Assumption for V2
        date: extractedData.dates?.issued || extractedData.date || extractedData.metadata?.doc_date, // [CRITICAL FIX] Map for Viewer
        dates: extractedData.dates,
        metadata: extractedData.metadata || {}, // [CRITICAL FIX] Pass through raw metadata
        entities: extractedData.entities,
        totals: extractedData.totals,
        total: extractedData.totals?.gross || extractedData.totals?.total || extractedData.total || 0,
        lines: (extractedData.lines || []).map(l => ({
            ...l,
            sku: l.sku || l.code,
            qty: l.qty || l.quantity,
            price: l.price || l.unitPrice
        })),
        docRefs: extractedData.docRefs,
        projectRef: extractedData.projectRef || extractedData.metadata?.project_ref, // [FIXED] Reliable mapping
        shippingMarks: extractedData.shippingMarks || (extractedData.metadata?.client_ref ? extractedData.metadata.client_ref : null) || (extractedData.docRefs?.customerOrder?.number ? extractedData.docRefs.customerOrder.number : null),

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

// NOTE: Auto-reconciliation is handled in the controller AFTER saving. 
// Wait, looking at the code above, the auto-reconciliation is NOT in engine.js. It's in the respective controllers!
// I'll leave engine.js as is here and move to the controller/service modifications.

module.exports = {
    process
};
