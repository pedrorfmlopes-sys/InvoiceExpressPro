/**
 * fimaInvoiceExtraction.js  — v3
 * Extractor for FIMA Carlo Frattini — Fatura (Factura)
 *
 * Gate conditions (in engine.js):
 *   /FIMA/i.test(text) && /Factura/i.test(text)
 *
 * docType: 'fima_invoice'
 *
 * DESIGN (mirrors Nicolazzi pattern):
 * ─────────────────────────────────────────────────────────────────
 * Poppler outputs FIMA invoices as fixed-width columns:
 *   Col 0–32   → SKU (or blank for continuation/source lines)
 *   Col 32–75  → Description
 *   Col 75+    → UM / Qty / Price / Disc1 / Disc2 / Total / VAT
 *
 * A "financial row" is ONLY a row that contains the quantity pattern:
 *   N.  <digits>,000    (e.g.  "N.  2,000  197,6000  50,00  10,00  177,84  95")
 *
 * All lines before a financial row are buffered as description/source-doc
 * lines.  When a financial row arrives, the entire buffer + financial row
 * are flushed as ONE article.
 * ─────────────────────────────────────────────────────────────────
 */

const { pdfBufferToTextPoppler } = require('../utils/popplerText');

async function processInvoice(pdfBuffer) {
    let rawText = '';
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        console.error('[FimaInvoiceExtractor] Poppler failed', e);
        throw new Error('Falha ao extrair texto do documento FIMA (Fatura).');
    }
    return parseInvoice(rawText);
}

// ─────────────────────────────────────────────────────────────────────────────
// Number helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseEuNum(s) {
    if (s == null) return 0;
    const str = String(s).trim();
    // Remove thousands dots, replace decimal comma with dot
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial row: ONLY rows with "N.  <qty>,000" pattern are articles
// ─────────────────────────────────────────────────────────────────────────────
// Examples of financial rows:
//   "F3600W    CUERPO ...    N.    2,000   197,6000   50,00  10,00  177,84  95"
//   "...        SUB ITEM     N.    1,000   140,4000   50,00  20,00   40,14  95"
const FIN_ROW_RE = /\bN\.\s+(\d{1,4}),(\d{3})\s/;

function isFinancialRow(raw) {
    return FIN_ROW_RE.test(raw);
}

/**
 * Parse numbers from a financial row.
 * Format (right→left): vatRate, total, disc2%, disc1%, unitPrice, qty
 *
 * qty is always displayed as  X,000  (integer × 1000 in comma notation)
 * unitPrice may have 4 decimals: 197,6000 = 197.60
 */
function parseFinancialRow(raw) {
    // 1. Extract quantity via N. pattern
    const qtyM = raw.match(/\bN\.\s+(\d{1,4}),(\d{3})\b/);
    const qty = qtyM ? parseInt(qtyM[1]) : 1;

    // 2. Collect all remaining numbers after "N."
    //    We look from the N. position onwards
    const afterN = raw.replace(/.*\bN\.\s+\d+,\d{3}/, '');

    // European numbers in the financial tail (price / discounts / total)
    // 4-decimal unit price: 197,6000 or 140,4000
    const eu4 = afterN.match(/(\d{1,3}(?:\.\d{3})*,\d{4})/g) || [];
    // 2-decimal numbers: discounts + total
    const eu2 = afterN.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g) || [];
    // Small integers for disc% / vat% 
    const ints = [...afterN.matchAll(/\b(\d{1,3})\b/g)].map(m => parseInt(m[1]));

    let unitPrice = 0, disc1 = 0, disc2 = 0, vatRate = 0, lineTotal = 0;

    if (eu4.length > 0) {
        unitPrice = parseEuNum(eu4[0]); // 4-decimal = unit price (e.g. 197,6000)
    }

    // The discount percentages and VAT rate are PLAIN integers (not EU-format numbers).
    // To avoid picking up digit components of EU numbers (e.g. '84' from '177,84'),
    // we strip all EU-formatted numbers from afterN before looking for plain integers.
    const afterNStripped = afterN
        .replace(/\d{1,3}(?:\.\d{3})*,\d{2,4}/g, ' ') // remove EU numbers
        .replace(/\s{2,}/g, ' ');

    // Remaining standalone integers in stripped string are: disc1, disc2, vatRate
    // FIMA layout: discuento  =  disc1%  disc2%  (then spaces)  total,xx  vatRate
    // But disc1/disc2 may also be stripped if they're "50,00" format.
    // Better: collect disc% from eu2 values (they are 2-decimal like 50,00, 10,00, 20,00)
    // The total is the LAST eu2 value, discounts are preceding eu2 values.
    if (eu2.length >= 2) {
        lineTotal = parseEuNum(eu2[eu2.length - 1]);
        // Preceding eu2 values are discounts (e.g. 50,00 = 50%, 10,00 = 10%)
        if (eu2.length >= 3) { disc1 = parseEuNum(eu2[eu2.length - 3]); }
        if (eu2.length >= 2) { disc2 = parseEuNum(eu2[eu2.length - 2]); }
    } else if (eu2.length === 1) {
        lineTotal = parseEuNum(eu2[0]);
    }

    // VAT rate: last standalone integer in the stripped line (e.g. "95" at end)
    const vatCandidates = [...afterNStripped.matchAll(/\b(\d{1,3})\b/g)].map(m => parseInt(m[1]));
    // Filter to plausible VAT rates (0, 4, 6, 10, 22, 23, 95 etc.)
    const lastInt = vatCandidates[vatCandidates.length - 1];
    if (lastInt !== undefined && lastInt >= 0 && lastInt <= 100) vatRate = lastInt;

    if (!lineTotal && qty && unitPrice) {
        lineTotal = parseFloat((qty * unitPrice * (1 - disc1 / 100) * (1 - disc2 / 100)).toFixed(2));
    }

    return { qty, unitPrice, disc1, disc2, vatRate, lineTotal };
}

/**
 * Extract SKU and description from a buffer of raw lines plus the financial row.
 *
 * Poppler column layout (observed from real documents):
 *   - SKU appears starting at position ~32 from left on SKU line
 *   - But since Poppler trims leading spaces variably, we take the first
 *     leftmost uppercase-starting alphanumeric token on a line as the SKU.
 *   - Description is the text following the SKU on the same line, plus
 *     any additional text from continuation lines (blank SKU column).
 *   - Source-doc lines (/Ddt|Or\.|Vs\./) are excluded from description.
 */
function extractSkuAndDesc(buffer) {
    let sku = '';
    const descParts = [];

    for (const rawLine of buffer) {
        const t = rawLine.trim();
        if (!t) continue;

        // Skip source-doc lines
        if (/^(Ddt|Or\.|Vs\.|pedido\s+\d|empotrado|cuerpos)/i.test(t)) continue;
        // Financial rows ARE processed for SKU/description — FIMA puts SKU + desc + numbers on ONE line

        // Extract text up to the 'N.' unit marker (or up to first numeric sequence)
        // This strips the quantity/price number tail from both SKU lines and description lines
        const textPart = t
            .replace(/\s+N\.\s+\d+.*$/, '')            // strip  " N.  2,000  ..." tail
            .replace(/\s{3,}\d{1,3},\d{4}.*$/, '')     // strip  "   197,6000..." tail
            .trim();

        if (!sku) {
            // Try to extract SKU: first uppercase token at the start of the trimmed line
            // FIMA SKUs: F3600W, F3111CN2BASF, F3031TXSXNIL.2BASF etc.
            const skuMatch = textPart.match(/^([A-Z][A-Z0-9._/\\-]{2,})(?:\s+(.*))?$/);
            if (skuMatch) {
                sku = skuMatch[1];
                const descText = (skuMatch[2] || '').trim();
                if (descText) descParts.push(descText);
            } else {
                // No SKU — treat as description
                if (textPart) descParts.push(textPart);
            }
        } else {
            // Continuation description line
            if (textPart && textPart !== sku) descParts.push(textPart);
        }
    }

    return { sku, description: descParts.join(' ').replace(/\s{2,}/g, ' ').trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────
function parseInvoice(rawText) {
    const pages = rawText.split(/\f|\u000c/);

    // ── Output accumulators ──
    let invoiceNumber = '';
    let docDate = '';
    let customerVat = '';
    let shippingMethod = '';
    let shippingTerms = '';
    let paymentCondition = '';
    let bankIban = '';
    let clientRef = '';
    let projectNote = '';
    const sourceDocs = [];

    let shippingName = '';
    const shippingAddressLines = [];
    let customerName = '';
    const customerAddressLines = [];

    const parsedLines = [];

    let totalImponibile = 0;
    let totalVat = 0;
    let totalDocument = 0;

    // Extract all metadata from full raw text (more reliable than line-by-line)
    if (pages.length > 0) {
        extractMetadata(rawText, {
            setInvoiceNumber: v => { if (!invoiceNumber) invoiceNumber = v; },
            setDocDate: v => { if (!docDate) docDate = v; },
            setCustomerVat: v => { if (!customerVat) customerVat = v; },
            setShippingMethod: v => { if (!shippingMethod) shippingMethod = v; },
            setShippingTerms: v => { if (!shippingTerms) shippingTerms = v; },
            setPaymentCondition: v => { if (!paymentCondition) paymentCondition = v; },
            setBankIban: v => { if (!bankIban) bankIban = v; },
            setClientRef: v => { if (!clientRef) clientRef = v; },
            setProjectNote: v => { if (!projectNote) projectNote = v; },
            addSourceDoc: v => sourceDocs.push(v),
            setShippingName: v => { if (!shippingName) shippingName = v; },
            addShippingAddress: v => shippingAddressLines.push(v),
            setCustomerName: v => { if (!customerName) customerName = v; },
            addCustomerAddress: v => customerAddressLines.push(v),
        });
    }

    // ── Line-item extraction per page ──
    pages.forEach(pageText => {
        const lines = pageText.split(/\r?\n/);
        let inTable = false;
        let buffer = []; // collects lines belonging to current item-in-progress

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            if (!trimmed) continue;

            // Detect table header to enter LINES zone
            if (/Condigo\s+Art|Description\s+art|UM\s+candidad|Condigo\s+Art\./i.test(trimmed)) {
                inTable = true;
                buffer = [];
                continue;
            }

            if (!inTable) continue;

            // Detect totals block → stop extracting items on this page
            if (/Imponibile\s|Gastos\s+de\s+Transporte|Scadenze|TOTALE\s+DOCUMENTO/i.test(trimmed)) {
                // Parse totals
                parseTotalsBlock(lines, i, {
                    setTotalImponibile: v => { if (!totalImponibile) totalImponibile = v; },
                    setTotalVat: v => { if (!totalVat) totalVat = v; },
                    setTotalDocument: v => { if (!totalDocument) totalDocument = v; },
                });
                break;
            }

            // Skip page noise
            if (/^Pag\.\s+\d|^FIMA\s+Carlo|^Via\s+Borgoman|^CF\s+P\.IVA|^Reg\.\s+Imp/i.test(trimmed)) continue;

            if (isFinancialRow(raw)) {
                // This row closes the current item
                buffer.push(raw);
                const nums = parseFinancialRow(raw);
                const { sku, description } = extractSkuAndDesc(buffer);

                if (sku || nums.lineTotal > 0) {
                    parsedLines.push({
                        sku,
                        description,
                        unit: 'N.',
                        quantity: nums.qty,
                        unitPrice: nums.unitPrice,
                        discount1: nums.disc1,
                        discount2: nums.disc2,
                        vatRate: nums.vatRate,
                        total: nums.lineTotal
                    });
                }
                buffer = []; // reset for next item
            } else if (buffer.length === 0 && parsedLines.length > 0 && /^\s{16,}/.test(raw)) {
                // Continuation line for the PREVIOUS item (blank SKU column, heavily indented).
                // FIMA places model family names on a line after the financial row:
                //   F3600W  CUERPO  ...  N.  2,000  177,84  95   ← financial row (flushed)
                //                  FIMABASINBOX                  ← continuation for above item
                const contText = trimmed
                    .replace(/^(Ddt|Or\.|Vs\.).*$/i, '') // skip source-doc lines
                    .trim();
                if (contText) {
                    parsedLines[parsedLines.length - 1].description += ' ' + contText;
                }
            } else {
                // Accumulate description / source-doc lines for next item
                buffer.push(raw);
            }
        }

        buffer = []; // clear at page boundary (don't carry over)
    });

    // ── Fallback totals ──
    if (!totalDocument) {
        const m = rawText.match(/TOTALE\s+DOCUMENTO[:\s]*([\d,.]+)/i) ||
            rawText.match(/EURO\s+([\d,.]+)/i);
        if (m) totalDocument = parseEuNum(m[1]);
    }
    if (!totalImponibile) {
        const m = rawText.match(/Imponibile[:\s]*([\d,.]+)/i);
        if (m) totalImponibile = parseEuNum(m[1]);
    }
    if (!totalDocument && totalImponibile) totalDocument = totalImponibile;
    if (!totalDocument && parsedLines.length > 0) {
        totalDocument = parsedLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
    }

    return {
        docType: 'fima_invoice',
        supplier: 'FIMA',
        metadata: {
            doc_number: invoiceNumber,
            doc_date: docDate,
            customer_vat: customerVat,
            shipping_method: shippingMethod,
            shipping_terms: shippingTerms,
            payment_condition: paymentCondition,
            bank_iban: bankIban,
            client_ref: clientRef,
            project_note: projectNote,
            source_docs: [...new Set(sourceDocs)].join(' | ')
        },
        entities: {
            supplier: {
                name: 'FIMA Carlo Frattini spa',
                vat: 'IT 00581420031',
                address: 'Via Borgomanero, 105 — 28010 Briga Novarese (Novara) Italy'
            },
            customer: {
                name: customerName,
                address: customerAddressLines.join(', ')
            },
            shipping: {
                name: shippingName,
                address: shippingAddressLines.join(', ')
            }
        },
        lines: parsedLines,
        totals: {
            net: parseFloat(totalImponibile || totalDocument || 0).toFixed(2),
            vat: parseFloat(totalVat).toFixed(2),
            transport: 0,
            gross: parseFloat(totalDocument || 0).toFixed(2),
            total: parseFloat(totalDocument || 0).toFixed(2)
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals block parser
// ─────────────────────────────────────────────────────────────────────────────
function parseTotalsBlock(lines, startIdx, cb) {
    for (let i = startIdx; i < Math.min(startIdx + 20, lines.length); i++) {
        const t = lines[i].trim();
        if (!t) continue;

        // Imponibile line: "921,96 95   NON IMP..." or "Imponibile  921,96"
        if (/Imponibile/i.test(t)) {
            const m = t.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})/);
            if (m) cb.setTotalImponibile(parseEuNum(m[1]));
        }
        // Importo IVA
        if (/Importo\s+IVA/i.test(t)) {
            const m = t.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})/);
            if (m) cb.setTotalVat(parseEuNum(m[1]));
        }
        // TOTALE DOCUMENTO
        if (/TOTALE\s+DOCUMENTO|EURO/i.test(t)) {
            const m = t.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})/);
            if (m) cb.setTotalDocument(parseEuNum(m[1]));
        }
        // BBa (payment schedule)
        if (/BBa/i.test(t)) {
            const m = t.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})/);
            if (m) cb.setTotalDocument(parseEuNum(m[1]));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata extractor
// Uses full-text regex search — more robust to Poppler layout variations.
// ─────────────────────────────────────────────────────────────────────────────
function extractMetadata(text, cb) {
    // ── Doc number + date ──
    // FIMA format (on same line or close proximity after PT VAT line):
    //   "932/00   22/01/2026   1 /    1"
    //   "    25/00              07/01/2026   1 /    2"
    // The doc number can be 2–4 digits followed by /NN (year suffix like /00, /25 etc.)
    // Strategy: find the pattern near "Numero documento" or right after the PT VAT line.
    // Must NOT match DDT refs like "1243/00" — those always appear AFTER the table header.
    // We search only in the header block (before the table header keyword).
    const headerBlock = text.split(/Condigo\s+Art/i)[0] || text.substring(0, 2000);
    const docNumDateM =
        headerBlock.match(/\b(\d{2,4}\/\d{2})\s{2,}(\d{2}\/\d{2}\/\d{4})\b/) ||
        headerBlock.match(/Numero\s+documento[\s\S]{0,200}?(\d{2,4}\/\d{2})[\s\S]{0,100}?(\d{2}\/\d{2}\/\d{4})/i);
    if (docNumDateM) {
        cb.setInvoiceNumber(docNumDateM[1]);
        cb.setDocDate(docNumDateM[2]);
    }


    // ── Customer VAT (PT XXXXXXXXX) ──
    const vatM = text.match(/\bPT\s+(\d{9})\b/);
    if (vatM) cb.setCustomerVat('PT' + vatM[1]);

    // ── Shipping + customer from "Entrega ... Distinguidos" block ──
    const entBlock = text.match(/Entrega\s+Distinguidos([\s\S]{0,800}?)(?:Factura|PROFORMA|Condigo)/i);
    if (entBlock) {
        const blockLines = entBlock[1].split(/\r?\n/).filter(l => l.trim());
        let shipSet = false, custSet = false;
        blockLines.forEach(l => {
            const mid = l.search(/\s{8,}/);
            if (mid > 0) {
                const left = l.substring(0, mid).trim();
                const right = l.substring(mid).trim();
                if (left && !shipSet && !/PORTOGALL|PORTUGAL|\d{4}-\d{3}/i.test(left)) {
                    cb.setShippingName(left); shipSet = true;
                } else if (left && shipSet && !/PORTOGALL|PORTUGAL/i.test(left)) {
                    cb.addShippingAddress(left);
                }
                // Right column: strip client-code prefix like "12.696"
                if (right && !custSet && !/^\d{2,6}[.,]\d{3}$/.test(right) && !/PORTOGALL|PORTUGAL|\d{4}-\d{3}/i.test(right)) {
                    const name = right.replace(/^\d{2,6}[.,]?\d{0,3}\s+/, '').trim();
                    if (name) { cb.setCustomerName(name); custSet = true; }
                } else if (right && custSet && !/PORTOGALL|PORTUGAL/i.test(right) && !/^\d{2,6}[.,]\d{3}$/.test(right)) {
                    cb.addCustomerAddress(right);
                }
            } else {
                const t = l.trim();
                if (t && !shipSet && !/PORTOGALL|PORTUGAL/i.test(t)) {
                    cb.setShippingName(t); shipSet = true;
                } else if (t && shipSet && !/Factura|PORTOGALL|PORTUGAL/i.test(t)) {
                    cb.addShippingAddress(t);
                }
            }
        });
    }

    // ── Shipping method + terms ──
    const envioM = text.match(/^Envio\s+(.+?)(?:\s{4,}Porte\s+(.+?))?$/m);
    if (envioM) {
        cb.setShippingMethod(envioM[1].trim());
        if (envioM[2]) cb.setShippingTerms(envioM[2].trim());
    }
    if (!envioM || !envioM[2]) {
        // Porte on its own line
        const porteM = text.match(/Porte\s*([\r\n]\s*)?(A\s+MEZZO|DAP|CIF|FOB|DDP[^\r\n]*)/i);
        if (porteM) cb.setShippingTerms(porteM[2].trim());
    }

    // ── Payment condition ──
    const codPagoM = text.match(/Cod\.?\s*Pago\s*[\r\n]+([^\r\n]{1,60})/i);
    if (codPagoM) cb.setPaymentCondition(codPagoM[1].replace(/Banco.*/i, '').trim());
    else {
        // Sometimes on same line: "100% T.T. in advance"
        const pagoInlineM = text.match(/(100%\s+T\.?T\.?[^\r\n]{0,50})/i);
        if (pagoInlineM) cb.setPaymentCondition(pagoInlineM[1].trim());
    }

    // ── IBAN ──
    const ibanM = text.match(/IBAN\s+(IT[\dA-Z]{22,27})/i);
    if (ibanM) cb.setBankIban(ibanM[1]);

    // ── Client ref (Vs. Rif.) ──
    const vsRifM = text.match(/Vs\.\s*Rif\.\s*([^\r\n]{1,80})/i);
    if (vsRifM) cb.setClientRef(vsRifM[1].trim());

    // ── Source docs (deduplicated later) ──
    const ddtRe = /Ddt\s+nr\.\s*[\d/]+\s+del\s+[\d/]+/ig;
    const orRe = /Or\.\s*Cl\.\s*num\.\s*[\d/]+(?:\s+del\s+[\d/]+)?/ig;
    let m;
    while ((m = ddtRe.exec(text)) !== null) cb.addSourceDoc(m[0].replace(/\s+/g, ' '));
    while ((m = orRe.exec(text)) !== null) cb.addSourceDoc(m[0].replace(/\s+/g, ' '));
}

module.exports = { processInvoice };
