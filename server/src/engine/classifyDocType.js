const normalizeStr = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function classifyDocType(text) {
    if (!text || text.length < 10) return null;
    const normalized = (text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 0. Scarabeo Specific (High Priority)
    // "Covering Invoice" is always a final invoice, even if it refers to a proforma.
    if (normalized.includes('scarabeo') && normalized.includes('covering invoice')) {
        return 'fatura';
    }

    // 1. Proforma Priority (Nicolazzi & Others)
    // Check for "proforma" first because many proformas contain the word "invoice" or "fatura"
    if (normalized.includes('proforma') || normalized.includes('pro-forma') || normalized.includes('pro forma') || normalized.includes('pro-form')) {
        return 'proforma';
    }

    // 1.5 Scarabeo Specific (Invoice fallback)
    if (normalized.includes('scarabeo') && normalized.includes('invoice')) {
        return 'fatura';
    }

    // 2. BUTO Priority
    if (normalized.includes('buto design') || normalized.includes('butobath.com') || normalized.includes('b02883957')) {
        return 'invoice';
    }

    // 3. Other specific types
    if (normalized.includes('nota de credito') || normalized.includes('credit note')) {
        return 'nota_credito';
    }

    if ((normalized.includes('encomenda') || normalized.includes('confirmation')) && !normalized.includes('invoice') && !normalized.includes('fatura') && !normalized.includes('fattura')) {
        return 'c_pedido';
    }

    if (normalized.includes('orcamento') || normalized.includes('proposta') || normalized.includes('budget')) {
        return 'offer';
    }

    // 4. Default to Invoice
    if (normalized.includes('fatura') || normalized.includes('invoice') || normalized.includes('recibo') || normalized.includes('fattura')) {
        return 'fatura';
    }

    return null; // Unknown
}

module.exports = classifyDocType;
