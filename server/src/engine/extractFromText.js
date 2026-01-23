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

    const headerText = text.substring(0, 2500); // Window for header

    // --- Doc Number (Nicolazzi Specific + Generic Strict) ---
    // Specific: 000049/B followed by Numero/Number on next line (or previous, depending on pdf-parse flow, user said \n Number)
    // User RegEx: header.match(/\n\s*([0-9]{3,}[\/-][A-Z0-9]+)\s*\n\s*Numero\/\s*Number/i)
    let m = headerText.match(/\n\s*([0-9]{3,}[\/-][A-Z0-9]+)\s*\n\s*Numero\/\s*Number/i);
    if (m) {
        extracted.docNumber = m[1].trim();
    } else {
        // Fallback Strict: Must contain digits. No "Banca di..."
        const docNumMatch = headerText.match(/(?:Fatura|Recibo|FT|FR|Fattura|Invoice)\s?(?:n\.?|nº|No)?\s?[:#.]?\s?([A-Z0-9\/ -]{3,20})/i);
        if (docNumMatch) {
            const candidate = docNumMatch[1].trim();
            // Anti-garbage filter: must have at least 1 digit, no spaces inside if short?
            if (/\d/.test(candidate) && !/appoggio/i.test(candidate)) {
                extracted.docNumber = candidate;
            }
        }
    }

    // --- Dates ---
    // Issued: Specific "Data/Date" below value
    let mIssued = headerText.match(/\n\s*(\d{2}\/\d{2}\/\d{4})\s*\n\s*Data\/\s*Date/i);
    if (mIssued) {
        extracted.dates.issued = normalizeDate(mIssued[1]);
    } else {
        // Generic fallback
        const dateMatch = headerText.match(/(?:Data|Date|Emissao|Emitido|Fattura)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
        if (dateMatch) extracted.dates.issued = normalizeDate(dateMatch[1]);
    }

    // Due: Scadenza/Maturity
    let mDue = text.match(/Scadenza\s*\/\s*Maturity:\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (mDue) {
        extracted.dates.due = normalizeDate(mDue[1]);
    } else {
        const dueMatch = text.match(/(?:Vencimento|Due Date|Venc)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
        if (dueMatch) extracted.dates.due = normalizeDate(dueMatch[1]);
    }

    // --- Entities ---
    // Supplier VAT (IT)
    const itVat = text.match(/\bIT\s*([0-9]{11})\b/);
    if (itVat) {
        extracted.entities.supplier.vat = 'IT' + itVat[1];
        // Supplier Name: First non-empty line heuristic
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        if (lines.length > 0) extracted.entities.supplier.name = lines[0];

        // Customer: First ALLCAPS after Supplier VAT?
        // Let's look for VAT index and search after
        const vatIndex = text.indexOf(itVat[0]);
        if (vatIndex > -1) {
            const afterVat = text.substring(vatIndex + itVat[0].length);
            const afterLines = afterVat.split('\n').map(l => l.trim()).filter(l => l.length > 3);
            for (const l of afterLines) {
                // Check if mostly uppercase (allow some spaces/numbers, but assume names are CAPS)
                const upper = l.toUpperCase();
                if (l === upper && !l.includes('VIA ') && !l.includes('CAP ')) {
                    extracted.entities.customer.name = l;
                    break;
                }
            }
        }
    }

    // Customer VAT (PT)
    const ptVat = text.match(/\bPT\s*([0-9]{9})\b/);
    if (ptVat) extracted.entities.customer.vat = 'PT' + ptVat[1];

    // --- Totals ---
    // Helper
    const findMoney = (regex) => {
        const m = text.match(regex);
        return m ? normalizeAmount(m[1]) : null;
    }

    // Generic
    extracted.totals.total = findMoney(/(?:Total a Pagar|Total Geral|Grand Total|Total Documento|Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);

    // Nicolazzi Subtotal: "Totale netto merce"
    extracted.totals.subtotal = findMoney(/(?:Totale netto merce)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i)
        || findMoney(/(?:Total Líquido|Net Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);

    // Tax heuristic for "Non Imp." / "ART.41" -> 0
    if ((text.includes('Non Imp.') || text.includes('ART.41')) && !extracted.totals.tax) {
        extracted.totals.tax = 0;
    } else {
        extracted.totals.tax = findMoney(/(?:Total IVA|Total VAT|Imposto|Totale imposta)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    }

    // --- Lines Extraction ---
    // Priority: Nicolazzi Regex
    // /^(?<sku>\d{4,}[A-Z0-9\/]*)\s*(?<desc>.+?)NR\s*(?<qty>\d+)\s*EUR\s*(?<unit>[0-9\.,]+)\s*(?<total>[0-9\.,]+)\s*(?<taxcode>NI\d+)?$/i
    const linesArr = text.split('\n');
    const seen = new Set();

    linesArr.forEach(line => {
        line = line.trim();
        if (line.length < 5) return;

        let processed = false;

        // 1. Nicolazzi Pattern
        if (line.includes('NR') && line.includes('EUR')) {
            const regex = /^([0-9]{4,}[A-Z0-9\/]*)\s+(.+?)\s+NR\s+(\d+)\s+EUR\s+([0-9\.,]+)\s+([0-9\.,]+)/i;
            const mLine = line.match(regex);
            if (mLine) {
                const q = parseFloat(mLine[3]);
                const p = normalizeAmount(mLine[4]);
                const t = normalizeAmount(mLine[5]);
                const sku = mLine[1];
                const desc = mLine[2].trim();

                // Dedupe key
                const key = `${sku}|${q}|${p}|${t}`;
                if (!seen.has(key)) {
                    extracted.lines.push({
                        code: sku,
                        description: desc,
                        quantity: q,
                        unitPrice: p,
                        total: t
                    });
                    seen.add(key);
                }
                processed = true;
            }
        }

        // 2. Generic Fallback (only if not processed and looks like a line)
        if (!processed) {
            // const moneyRegex ... (reuse previous existing logic if needed, but risky for Nicolazzi mixed content)
            // Keeping it simple: if Nicolazzi matched lines, rely on that.
            // If total extraction methods below generic lines might double count?
            // Let's leave generic fallback active but strict

            const endingNumbers = line.match(/(\d+(?:[\.,]\d+)?)\s+(\d+(?:[\.,]\d+)?)\s+(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})$/);
            if (endingNumbers) {
                // Check coherence to avoid false positives
                const q = normalizeAmount(endingNumbers[1]);
                const p = normalizeAmount(endingNumbers[2]);
                const t = normalizeAmount(endingNumbers[3]);
                if (q && p && t && Math.abs((q * p) - t) < 0.05) {
                    const remainder = line.substring(0, line.length - endingNumbers[0].length).trim();
                    const key = `GEN|${remainder}|${q}|${p}|${t}`;
                    if (!seen.has(key)) {
                        // Only add if we haven't seen meaningful lines from specific parsers, or if this is clearly distinct?
                        // For now, allow it but it might cause dupes if patterns overlap. 
                        // Nicolazzi pattern requires 'NR' so they shouldn't overlap with generic ending numbers unless line has NR.
                        extracted.lines.push({ description: remainder, quantity: q, unitPrice: p, total: t });
                        seen.add(key);
                    }
                }
            }
        }
    });

    return extracted;
}

module.exports = extractFromText;
