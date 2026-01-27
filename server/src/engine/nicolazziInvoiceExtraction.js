const { normalizeAmount, normalizeDate } = require('./normalize');

function extractNicolazziInvoice(text) {
    // 0. Gating: Reject Proforma explicitely
    if (/PROFORMA\s+INVOICE/i.test(text)) {
        return {
            docType: 'proforma',
            confidence: 0,
            lines: [],
            totals: {},
            entities: {},
            dates: {},
            needsReview: true,
            reviewReason: 'Proforma detected in Invoice Extractor'
        };
    }

    const extracted = {
        docType: 'invoice',
        docNumber: null,
        dates: { issued: null, due: null },
        docRefs: {
            deliveryNote: null
        },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: null,
            total: null,
            discountMain: null,
            discountExtra: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: { name: "NICOLAZZI s.p.a.", vat: "IT00115930034", address: "28010 ALZO (NO) - Via P. Durio, 119" },
            shipTo: null
        },
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: {
            extractor: 'nicolazziInvoiceExtraction',
        }
    };

    if (!text) return extracted;
    const headerText = text.substring(0, 2500);

    // --- Doc Number ---
    let m = headerText.match(/\n\s*([0-9]{3,}[\/-][A-Z0-9]+)\s*\n\s*Numero\/\s*Number/i);
    if (!m) m = headerText.match(/\b(\d{3,8}\/[A-Z0-9]{1,3})\b/);
    if (m) extracted.docNumber = m[1] || m[0];
    else {
        const docNumMatch = headerText.match(/(?:Fatura|Recibo|FT|FR|Fattura|Invoice)\s?(?:n\.?|nº|No)?\s?[:#.]?\s?([A-Z0-9\/ -]{3,20})/i);
        if (docNumMatch && !/appoggio/i.test(docNumMatch[1])) extracted.docNumber = docNumMatch[1].trim();
    }

    // --- Dates ---
    let mIssued = headerText.match(/\n\s*(\d{2}\/\d{2}\/\d{4})\s*\n\s*Data\/\s*Date/i);
    if (mIssued) extracted.dates.issued = normalizeDate(mIssued[1]);

    // --- Entities (Customer) ---
    const itVat = text.match(/\bIT\s*([0-9]{11})\b/);
    if (itVat) {
        const vatIndex = text.indexOf(itVat[0]);
        if (vatIndex > -1) {
            const afterVat = text.substring(vatIndex + itVat[0].length);
            const afterLines = afterVat.split('\n').map(l => l.trim()).filter(l => l.length > 3);
            for (const l of afterLines) {
                const upper = l.toUpperCase();
                if (l === upper && !l.includes('VIA ') && !l.includes('CAP ') && !l.includes('TEL')) {
                    extracted.entities.customer.name = l;
                    break;
                }
            }
        }
    }
    const ptVat = text.match(/\bPT\s*([0-9]{9})\b/);
    if (ptVat) extracted.entities.customer.vat = 'PT' + ptVat[1];


    // --- Line Extraction ---
    const linesArr = text.split('\n');
    const seen = new Set();

    // Regex Core: UOM|QTY|EUR|Price|Total|TaxCode
    const strictCoreRe = /(?:(NR|PZ|CF|KG|M|COPPIA|PAIO|SET|PIECE)\s*)?(\d+)\s*EUR\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})(?:\s*(NI\d+))?/i;

    // Helper Regexes
    const footerMarkers = /continua|Scadenza|Totale\s+da\s+pagare|Totale\s+netto\s+merce|Totale\s+imponibile|Totale\s+imposta|Spese\s+incasso|Sconto\s+di\s+pagamento|Trasporto|Anticipo|\bRua\b|Industria|Portogallo|\bPorto\b|D\.L\.|Art\.|TROFA|concordati|IT\s*\d+|PT\s*\d+|SA\d+/i;
    const legalMarkers = /(in relazione al presente documento|assumendo agli effetti|piena e diretta responsabilita|dichiara di garantire|veridicit|vigenti disposizioni)/i;

    // Guard Functions
    const isMoneyLine = (s) => {
        if (/\bEUR\b/i.test(s) || /\bNI\d+\b/i.test(s)) return true;
        const moneyRe = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
        return (s.match(moneyRe) || []).length >= 2;
    };

    const isFooterOrLegal = (s) => {
        return footerMarkers.test(s) || legalMarkers.test(s);
    };

    // Strict SKU Check: Begins with [R]?[0-9] and has meaningful content
    // e.g. 5107..., R2438...
    const looksLikeSKUStart = (s) => {
        const t = (s.trim().split(/\s+/)[0] || '').trim();
        if (!t) return false;

        // Filter out dates (15/01/2025)
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return false;

        // Must start with a Digit OR 'R' followed by Digit
        // Matches: 5..., R2..., 1...
        // Rejects: EXTERNAL, SINGLE, BOCCA, DDT
        if (/^(?:R?\d)/i.test(t)) {
            // Must have some length and structure
            if (t.length >= 3 && /[0-9]/.test(t)) return true;
        }
        return false;
    };

    const normalizeAppend = (a, b) => (a ? (a + ' ' + b) : b).replace(/\s+/g, ' ').trim();

    // State
    let lastLine = null;
    let pendingPrefix = [];
    let inFooter = false;

    linesArr.forEach(line => {
        line = line.trim();
        if (line.length < 5) return;

        // 1. DDT Extraction (Always check, regardless of footer state)
        const mDDT = line.match(/DDT\s+Nr\.?\s*(\d+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (mDDT) {
            extracted.docRefs.deliveryNote = {
                number: mDDT[1],
                date: normalizeDate(mDDT[2]),
                raw: mDDT[0]
            };
            return; // Consume line
        }

        // 2. Core Match (Priority: Resets Footer Latch)
        const mCore = line.match(strictCoreRe);
        if (mCore) {
            // New Item -> Reset footer latch
            inFooter = false;

            const uom = mCore[1] ? mCore[1].toUpperCase() : null;
            const q = parseInt(mCore[2], 10);
            const p = normalizeAmount(mCore[3]);
            const t = normalizeAmount(mCore[4]);
            const taxCode = mCore[5] || null;

            // Left Side Analysis
            const before = line.substring(0, mCore.index).trim();
            const tokens = before.split(/\s+/);

            let sku = null;
            let desc = "";
            let orderRef = null;

            if (tokens.length > 0) {
                sku = tokens[0];
                let descTokens = tokens.slice(1);

                // Squeeze Fix: If SKU absorbed description (e.g. ...312BOCCA)
                // Split greedy digit-ending Code vs Start-with-Letters Description
                const squeezeMatch = sku.match(/^((?:R?[-_/.\w]*\d))([A-Za-z]{3,}.*)$/);
                if (squeezeMatch) {
                    sku = squeezeMatch[1];
                    const leakedDesc = squeezeMatch[2];
                    descTokens.unshift(leakedDesc);
                }

                // Order Ref Extraction (e.g. 25/02326)
                // Check tokens for specific pattern and remove
                const refRe = /\b\d{2}\/\d{3,6}\b/;
                const refIdx = descTokens.findIndex(tk => refRe.test(tk));

                if (refIdx !== -1) {
                    orderRef = descTokens[refIdx];
                    // Remove from description
                    descTokens.splice(refIdx, 1);
                }

                desc = descTokens.join(' ');
            }

            // Flush pendingPrefix to Description start
            if (pendingPrefix.length) {
                desc = normalizeAppend(pendingPrefix.join(' '), desc);
                pendingPrefix = [];
            }

            desc = desc.replace(/\s+/g, ' ').trim();

            if (sku) {
                const key = `${sku}|${q}|${p}|${t}`;
                if (!seen.has(key)) {
                    const newLine = {
                        code: sku,
                        description: desc,
                        quantity: q,
                        unitPrice: p,
                        total: t,
                        taxCode,
                        orderRef: orderRef,
                        uom: uom,
                        customerRef: null,
                        finishText: null
                    };
                    extracted.lines.push(newLine);
                    seen.add(key);
                    lastLine = newLine;
                }
            }
            return; // Line handled
        }

        // 3. Footer Latch Check (Set Footer)
        if (isFooterOrLegal(line)) {
            inFooter = true;
            lastLine = null;
            pendingPrefix = [];
            return;
        }

        // 4. Ignore if inFooter
        if (inFooter) return;

        // 5. Non-Core Logic


        // Doc number safety
        if (extracted.docNumber && line.includes(extracted.docNumber)) return;

        if (looksLikeSKUStart(line)) {
            // Start of a detached item?
            pendingPrefix.push(line);
            lastLine = null; // Break continuity
            return;
        }

        if (isMoneyLine(line)) return;

        // Multiline append
        if (lastLine && line.length > 3) {
            lastLine.description = normalizeAppend(lastLine.description, line);
        }
    });

    // --- Totals ---
    const findMoney = (regex) => {
        const m = text.match(regex);
        return m ? normalizeAmount(m[1]) : null;
    }
    extracted.totals.total = findMoney(/(?:Total a Pagar|Total Geral|Grand Total|Total Documento|Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.subtotal = findMoney(/(?:Totale netto merce)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i)
        || findMoney(/(?:Total Líquido|Net Total)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);
    extracted.totals.tax = findMoney(/(?:Total IVA|Total VAT|Imposto|Totale imposta)[\s\S]{0,20}?(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/i);

    extracted.confidence = 0.95;
    return extracted;
}

module.exports = extractNicolazziInvoice;
