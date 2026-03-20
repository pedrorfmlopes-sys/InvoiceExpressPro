/**
 * fimaProformaExtraction.js
 * Extractor for FIMA Carlo Frattini — Proforma (PROFORMA)
 *
 * Gate conditions (in engine.js):
 *   /FIMA/i.test(text) && /\bPROFORMA\b/i.test(text) && !/CONFIRMACION PEDIDO/i.test(text)
 *
 * docType: 'fima_proforma'
 *
 * Same layout as OC — differences: no expedition week, has IBAN, header keyword is PROFORMA.
 */

const { pdfBufferToTextPoppler } = require('../utils/popplerText');
const { parseOrderConfirmation } = require('./fimaOrderExtraction');

async function processProforma(pdfBuffer) {
    let rawText = '';
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        console.error('[FimaProformaExtractor] Poppler failed', e);
        throw new Error('Falha ao extrair texto do documento FIMA (Proforma).');
    }

    // Re-use OC parser (same table structure) then fix docType + extract IBAN
    const result = parseOrderConfirmation(rawText, { cleanRef: false });
    result.docType = 'fima_proforma';

    // Extract IBAN from raw text
    const ibanMatch = rawText.match(/IBAN\s+(IT[\dA-Z]+)/i);
    if (ibanMatch) {
        result.metadata.bank_iban = ibanMatch[1];
    }

    // Remove expedition week (not present in proformas)
    delete result.metadata.expedition_week;

    return result;
}

module.exports = { processProforma };
