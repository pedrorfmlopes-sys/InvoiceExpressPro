const normalizeStr = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function classifyDocType(text) {
    if (!text || text.length < 10) return null;
    const normalized = (text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Proforma Priority (Nicolazzi & Others)
    // Check for "proforma" first because many proformas contain the word "invoice" or "fatura"
    if (normalized.includes('proforma') || normalized.includes('pro-forma') || normalized.includes('pro forma') || normalized.includes('pro-form')) {
        return 'proforma';
    }

    // 2. BUTO Priority
    if (normalized.includes('buto design') || normalized.includes('butobath.com') || normalized.includes('b02883957')) {
        return 'invoice';
    }

    // 3. Other specific types
    if (normalized.includes('nota de credito') || normalized.includes('credit note')) {
        return 'credit_note';
    }

    if (normalized.includes('encomenda') || normalized.includes('confirmation')) {
        return 'order_confirmation';
    }

    if (normalized.includes('orcamento') || normalized.includes('proposta') || normalized.includes('budget')) {
        return 'offer';
    }

    // 4. Default to Invoice
    if (normalized.includes('fatura') || normalized.includes('invoice') || normalized.includes('recibo') || normalized.includes('fattura')) {
        return 'invoice';
    }

    return null; // Unknown
}

module.exports = classifyDocType;
