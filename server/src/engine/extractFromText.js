const { normalizeAmount, normalizeDate } = require('./normalize');
const extractButo = require('./butoExtraction');

function extractFromText(text) {
    // --- Router: Check for BUTO profile ---
    if (/BUTO\s+DESIGN/i.test(text) || /butobath\.com/i.test(text)) {
        return extractButo(text);
    }

    // --- Standard V2 Extraction (Nicolazzi / Generic) ---
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

    // --- Doc Number ---
    let m = headerText.match(/\n\s*([0-9]{3,}[\/-][A-Z0-9]+)\s*\n\s*Numero\/\s*Number/i);
    if (m) {
        extracted.docNumber = m[1].trim();
    } else {
        const docNumMatch = headerText.match(/(?:Fatura|Recibo|FT|FR|Fattura|Invoice)\s?(?:n\.?|nº|No)?\s?[:#.]?\s?([A-Z0-9\/ -]{3,20})/i);
        if (docNumMatch) {
            const candidate = docNumMatch[1].trim();
            if (/\d/.test(candidate) && !/appoggio/i.test(candidate)) {
                extracted.docNumber = candidate;
            }
        }
    }

    // --- Dates ---
    let mIssued = headerText.match(/\n\s*(\d{2}\/\d{2}\/\d{4})\s*\n\s*Data\/\s*Date/i);
    if (mIssued) {
        extracted.dates.issued = normalizeDate(mIssued[1]);
    } else {
        const dateMatch = headerText.match(/(?:Data|Date|Emissao|Emitido|Fattura)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
        if (dateMatch) extracted.dates.issued = normalizeDate(dateMatch[1]);
    }

    let mDue = text.match(/(\d{2}\/\d{2}\/\d{4})\s*\n\s*Scadenza\s*\/\s*Maturity/i);
    if (!mDue) {
        mDue = text.match(/Scadenza\s*\/\s*Maturity(?:[:\s]+)?\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    }
    if (mDue) {
        extracted.dates.due = normalizeDate(mDue[1]);
    } else {
        const dueMatch = text.match(/(?:Vencimento|Due Date|Venc)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
        if (dueMatch) extracted.dates.due = normalizeDate(dueMatch[1]);
    }

    // --- Entities ---
    const itVat = text.match(/\bIT\s*([0-9]{11})\b/);
    if (itVat) {
        extracted.entities.supplier.vat = 'IT' + itVat[1];
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        if (lines.length > 0) extracted.entities.supplier.name = lines[0];

        const vatIndex = text.indexOf(itVat[0]);
        if (vatIndex > -1) {
            const afterVat = text.substring(vatIndex + itVat[0].length);
            const afterLines = afterVat.split('\n').map(l => l.trim()).filter(l => l.length > 3);
            for (const l of afterLines) {
                const upper = l.toUpperCase();
                if (l === upper && !l.includes('VIA ') && !l.includes('CAP ')) {
                    extracted.entities.customer.name = l;
                    break;
                }
            }
        }
    }
    const ptVat = text.match(/\bPT\s*([0-9]{9})\b/);
    if (ptVat) extracted.entities.customer.vat = 'PT' + ptVat[1];

    // --- Totals ---
    const findMoney = (regex) => {
        const m = text.match(regex);
        return m ? normalizeAmount(m[1]) : null;
    }

    extracted.totals.total = findMoney(/(?:Total a Pagar|Total Geral|Grand Total|Total Documento|Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.subtotal = findMoney(/(?:Totale netto merce)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i)
        || findMoney(/(?:Total Líquido|Net Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);

    if ((text.includes('Non Imp.') || text.includes('ART.41')) && !extracted.totals.tax) {
        extracted.totals.tax = 0;
    } else {
        extracted.totals.tax = findMoney(/(?:Total IVA|Total VAT|Imposto|Totale imposta)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    }

    // --- Lines Extraction ---
    const linesArr = text.split('\n');
    const seen = new Set();
    const strictCoreRe = /NR\s*(\d+)\s*EUR\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})(?:\s*(NI\d+))?/i;
    const SUFFIXES = ['EXTERNAL', 'SINGLE', 'BUILT', 'SHOWER', 'COUPLE', 'COLUMN', 'TRIM', 'BASIN', 'LEVER', 'HOOK', 'WASTE', 'SIPHON'];

    linesArr.forEach(line => {
        line = line.trim();
        if (line.length < 5) return;

        let processed = false;

        // 1. Nicolazzi Anchor Pattern (Strict)
        if (line.includes('NR') && line.includes('EUR')) {
            const mCore = line.match(strictCoreRe);

            if (mCore) {
                const q = parseInt(mCore[1], 10);
                const p = normalizeAmount(mCore[2]);
                const t = normalizeAmount(mCore[3]);
                const taxCode = mCore[4] || null;

                const before = line.substring(0, mCore.index).trim();
                let sku = null;
                let desc = before;
                let customerRef = null;

                // SKU Extraction
                const codeMatch = before.match(/^([A-Z]?\d[0-9A-Z\/]{3,18})[\s\b](.*)$/i)
                    || before.match(/^([A-Z]?\d[0-9A-Z\/]{3,30})/i);

                if (codeMatch) {
                    let candidateSku = codeMatch[1];
                    let candidateDesc = (codeMatch[2] || before.substring(candidateSku.length)).trim();

                    // Post-processing Splitting Logic
                    let suffixFound = false;
                    for (const s of SUFFIXES) {
                        const ucSku = candidateSku.toUpperCase();
                        if (ucSku.endsWith(s) && ucSku.length > s.length) {
                            candidateSku = candidateSku.substring(0, candidateSku.length - s.length);
                            candidateDesc = s + (candidateDesc ? ' ' + candidateDesc : '');
                            suffixFound = true;
                            break;
                        }
                    }

                    if (!suffixFound) {
                        const mixedCase = candidateSku.match(/^(.+?)(?=[A-Z][a-z])/);
                        if (mixedCase && mixedCase[1].length > 3) {
                            const realSku = mixedCase[1];
                            const remainder = candidateSku.substring(realSku.length);
                            candidateSku = realSku;
                            candidateDesc = remainder + (candidateDesc ? ' ' + candidateDesc : '');
                        }
                    }

                    sku = candidateSku;
                    desc = candidateDesc;
                }

                const refMatch = desc.match(/\bARQ\.?\s*[A-ZÀ-Ü0-9\.]+\s+[A-ZÀ-Ü0-9\.]+\b/i);
                if (refMatch) {
                    customerRef = refMatch[0].trim();
                    desc = desc.replace(refMatch[0], '').replace(/\s{2,}/g, ' ').trim();
                }

                const key = `${sku || ''}|${q}|${p}|${t}`;
                if (!seen.has(key)) {
                    extracted.lines.push({
                        code: sku,
                        description: desc || before,
                        quantity: q,
                        unitPrice: p,
                        total: t,
                        taxCode,
                        customerRef
                    });
                    seen.add(key);
                }
                processed = true;
            }
        }

        // 2. Generic Fallback
        if (!processed) {
            const endingNumbers = line.match(/(\d+(?:[\.,]\d+)?)\s+(\d+(?:[\.,]\d+)?)\s+(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})$/);
            if (endingNumbers) {
                const q = normalizeAmount(endingNumbers[1]);
                const p = normalizeAmount(endingNumbers[2]);
                const t = normalizeAmount(endingNumbers[3]);
                if (q && p && t && Math.abs((q * p) - t) < 0.05) {
                    const remainder = line.substring(0, line.length - endingNumbers[0].length).trim();
                    const key = `GEN|${remainder}|${q}|${p}|${t}`;
                    if (!seen.has(key)) {
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
