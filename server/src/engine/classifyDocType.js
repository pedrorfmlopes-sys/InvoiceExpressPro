const normalizeStr = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const CLASSIFICATION_RULES = [
    { type: 'invoice', keywords: ['buto design', 'butobath.com'] }, // Specific Priority
    { type: 'invoice', keywords: ['fatura', 'invoice', 'fattura', 'rechnung', 'recibo'] },
    { type: 'proforma', keywords: ['proforma', 'pro-forma', 'pro forma', 'pró-forma'] }, // Higher priority usually
    { type: 'credit_note', keywords: ['nota de credito', 'credit note', 'crédito', 'nc ', 'devolucao'] },
    { type: 'order_confirmation', keywords: ['encomenda', 'order confirmation', 'confirmacao', 'pedido'] },
    { type: 'offer', keywords: ['orcamento', 'offer', 'quote', 'cotacao', 'proposta'] }
];

function classifyDocType(text) {
    if (!text || text.length < 10) return null;
    const normalized = normalizeStr(text);

    // BUTO Priority
    if (normalized.includes('buto design') || normalized.includes('butobath.com') || normalized.includes('b02883957')) {
        return 'invoice';
    }

    // Specific overrides first (Proforma often contains "Fatura", so check Proforma first or check specific combinations)
    if (normalized.includes('proforma') || normalized.includes('pro-forma') || normalized.includes('pró-forma')) {
        return 'proforma';
    }

    if (normalized.includes('nota de credito') || normalized.includes('credit note')) {
        return 'credit_note';
    }

    if (normalized.includes('encomenda') || normalized.includes('confirmation')) {
        return 'order_confirmation';
    }

    if (normalized.includes('orcamento') || normalized.includes('proposta') || normalized.includes('budget')) {
        return 'offer';
    }

    // Default to Invoice if "Fatura" is present and none of the above matched
    if (normalized.includes('fatura') || normalized.includes('invoice') || normalized.includes('recibo')) {
        return 'invoice';
    }

    return null; // Unknown
}

module.exports = classifyDocType;
