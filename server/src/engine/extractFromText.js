const { normalizeAmount, normalizeDate } = require('./normalize');

function extractFromText(text) {
    const extracted = {
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: null,
            total: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null },
            supplier: { name: null, vat: null }
        }
    };

    if (!text) return extracted;

    // --- Doc Number ---
    // Look for "Fatura Nº 123", "FT 123", etc.
    const docNumMatch = text.match(/(?:Fatura|Recibo|FT|FR|NC|Doc)\s?(?:n\.?|nº|No)?\s?[:#.]?\s?([A-Za-z0-9\/ -]{3,20})/i);
    if (docNumMatch) extracted.docNumber = docNumMatch[1].trim();

    // --- Dates ---
    // Issued
    const dateMatch = text.match(/(?:Data|Date|Emissao|Emitido)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
    if (dateMatch) extracted.dates.issued = normalizeDate(dateMatch[1]);

    // Due (Vencimento)
    const dueMatch = text.match(/(?:Vencimento|Due Date|Venc)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
    if (dueMatch) extracted.dates.due = normalizeDate(dueMatch[1]);

    // --- Totals ---
    // Helper to find value after key
    const findMoney = (regex) => {
        const m = text.match(regex);
        return m ? normalizeAmount(m[1]) : null;
    }

    extracted.totals.net = findMoney(/(?:Total Líquido|Net Total|Base Incidência|Subtotal)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i) || findMoney(/(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})\s?(?:Eur|€)\s*$/im);
    extracted.totals.tax = findMoney(/(?:Total IVA|Total VAT|Imposto)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.gross = findMoney(/(?:Total a Pagar|Total Geral|Grand Total|Total Documento|Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.transport = findMoney(/(?:Transporte|Portes|Shipping)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.packaging = findMoney(/(?:Embalagem|Packaging)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.discount = findMoney(/(?:Desconto|Discount)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);

    // --- Entities (Customer) ---
    // Try to find NIF/VAT
    const nifMatch = text.match(/(?:NIF|VAT|Contrib):?\s?([A-Z]{0,2}\d{9})/i);
    if (nifMatch) extracted.entities.customer.vat = nifMatch[1];

    // --- Lines Extraction (Naive/Robust) ---
    // Look for patterns like: REF123 Description Qty Price Total
    // Strategy: Split by new lines, look for lines ending in currency format that have a number (qty) before.
    const linesArr = text.split('\n');
    let lastLine = null;

    linesArr.forEach(line => {
        line = line.trim();
        if (line.length < 5) return;

        // Pattern: [Code?] [Description] [Qty] [Price] [Total]
        // Heuristic: End of line should be a money amount. Preceded by another money (price) or number (qty).

        // Regex to capture last 2 or 3 numbers
        // Example: "A001 Product   2   10.00   20.00"

        const moneyRegex = /(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/;
        // Very basic capturing of lines with at least 2 numbers at the end
        const endingNumbers = line.match(/(\d+(?:[\.,]\d+)?)\s+(\d+(?:[\.,]\d+)?)\s+(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})$/);

        if (endingNumbers) {
            // Found Qty, Price, Total?
            const q = normalizeAmount(endingNumbers[1]);
            const p = normalizeAmount(endingNumbers[2]);
            const t = normalizeAmount(endingNumbers[3]);

            // Check coherence (Qty * Price ~= Total)
            if (q && p && t && Math.abs((q * p) - t) < 0.05) {
                // Valid line
                const remainder = line.substring(0, line.length - endingNumbers[0].length).trim();
                extracted.lines.push({
                    description: remainder,
                    quantity: q,
                    unitPrice: p,
                    total: t
                });
                return;
            }
        }

        // Fallback: Just Total at end
        // "A001 Product Name   20.00"
        const justTotal = line.match(/(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})$/);
        if (justTotal) {
            // Could be a total or a line with implicit 1 qty
            return; // Too risky, ignore single number lines for now to avoid false positives (headers, subtotals)
        }
    });

    // Dedupe Lines (Consecutive Identical)
    extracted.lines = extracted.lines.filter((line, index) => {
        if (index === 0) return true;
        const prev = extracted.lines[index - 1];
        const isSame = line.description === prev.description && line.total === prev.total;
        return !isSame;
    });

    return extracted;
}

module.exports = extractFromText;
