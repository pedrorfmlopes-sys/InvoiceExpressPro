/**
 * fimaOrderExtraction.js
 * Extractor for FIMA Carlo Frattini — Confirmação de Pedido (CONFIRMACION PEDIDO)
 *
 * Gate conditions (in engine.js):
 *   /FIMA/i.test(text) && /CONFIRMACION PEDIDO/i.test(text)
 *
 * docType: 'fima_c_pedido'
 */

const { pdfBufferToTextPoppler } = require('../utils/popplerText');

async function processOrderConfirmation(pdfBuffer) {
    let rawText = '';
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        console.error('[FimaOrderExtractor] Poppler failed', e);
        throw new Error('Falha ao extrair texto do documento FIMA (OC).');
    }

    return parseOrderConfirmation(rawText);
}

function parseOrderConfirmation(rawText, options = { cleanRef: true }) {
    const lines = rawText.split(/\r?\n/);

    // ─── State machine ───────────────────────────────────────────────
    let state = 'HEADER';

    // Header fields
    let orderNumber = '';
    let docDate = '';
    let customerVat = '';
    let shippingMethod = '';
    let shippingTerms = '';
    let paymentCondition = '';
    let expeditionWeek = '';
    let clientRef = '';        // Vs. Rif. / references before line table
    let projectNote = '';

    // Entities
    let shippingName = '';
    let shippingAddressLines = [];
    let customerName = '';
    let customerAddressLines = [];

    // Line items
    const parsedLines = [];
    let currentLine = null;

    // Totals
    let totalNet = 0;

    // ─── Helpers ─────────────────────────────────────────────────────
    const parseEuNum = (s) => {
        if (!s) return 0;
        return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
    };

    // SKU pattern: starts with letter(s) then digits, may contain dots/slashes
    const SKU_RE = /^([A-Z][A-Z0-9._/\\-]{2,})\s{2,}(.+?)\s{2,}(N\.|KG\.?|PZ\.?)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s*$/;
    // Looser SKU start (just check the beginning of the line)
    const SKU_START_RE = /^([A-Z][A-Z0-9._/\\-]{2,})\s/;

    const TABLE_HEADER_RE = /Condigo Art|Cód.*Artículo|Description artículo/i;
    const TOTALS_RE = /Tot\.\s*Pedido|Sconto\s*%|Gastos de Transporte|Ufficio Vendite/i;

    // ─── Parse ───────────────────────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) continue;

        // ─ Extract shipping & customer from Entrega/Distinguidos block ─
        if (trimmed.startsWith('Entrega') && trimmed.includes('Distinguidos')) {
            // Next several lines have shipping (left) and customer (right)
            for (let j = 1; j <= 10; j++) {
                const l = lines[i + j] || '';
                if (!l.trim()) continue;
                if (/CONFIRMACION PEDIDO|PROFORMA|Factura/i.test(l)) break;

                // Split at large whitespace gap between the two columns
                const mid = l.indexOf('                    ');
                if (mid > 0) {
                    const left = l.substring(0, mid).trim();
                    const right = l.substring(mid).trim();
                    if (left && !shippingName) { shippingName = left; }
                    else if (left) { shippingAddressLines.push(left); }
                    if (right && !customerName && !/PORTOGALLO|PORTUGAL/i.test(right)) { customerName = right.replace(/^\d+\s+/, '').trim(); }
                    else if (right && customerName && !/PORTOGALLO|PORTUGAL/i.test(right)) { customerAddressLines.push(right); }
                } else {
                    const t = l.trim();
                    if (t && !shippingName) shippingName = t;
                    else if (t) shippingAddressLines.push(t);
                }
            }
            continue;
        }

        // ─ Doc metadata: search full header block (more robust than line-by-line) ─
        // PROFORMA line: "PT 515226963  1058/00  26/02/2026  A MEZZO CORRIERE ..."
        // OC line:       "6361/00  03/03/2026  515226963  A MEZZO CORRIERE ..."
        // We defer this to post-loop processing via full-text search (see below).
        // ─ Payment condition + Expedition week ─
        if (/Cod\.?\s*Pago/i.test(trimmed)) {
            const dataLine = lines[i + 1] || '';
            paymentCondition = dataLine
                .replace(/EXPEDICION[\s\S]*/i, '')    // strip expedition week suffix
                .replace(/\s{8,}[\s\S]*$/, '')         // strip right-column bank data
                .replace(/\s+Banco[\s\S]*/i, '')       // strip Banco keyword and after
                .replace(/\s+IBAN[\s\S]*/i, '')        // strip IBAN keyword and after
                .replace(/\s+INTESA[\s\S]*/i, '')      // strip bank name if any
                .trim();
            const expM = dataLine.match(/EXPEDICION\s*(.+)/i) || trimmed.match(/EXPEDICION\s*(.+)/i);
            if (expM) expeditionWeek = expM[1].trim();
            // Also try next line
            const line2 = lines[i + 2] || '';
            const expM2 = line2.match(/semana\s*(.+)/i);
            if (expM2) expeditionWeek = 'semana ' + expM2[1].trim();
            continue;
        }

        if (/EXPEDICION/i.test(trimmed) && !expeditionWeek) {
            expeditionWeek = trimmed.replace(/EXPEDICION\s*/i, '').trim();
            continue;
        }

        // ─ Table start ─
        if (TABLE_HEADER_RE.test(trimmed)) {
            state = 'LINES';
            continue;
        }

        // ─ Totals stop ─
        if (state === 'LINES' && TOTALS_RE.test(trimmed)) {
            // Extract total
            const totalM = trimmed.match(/[\d,.]{3,}/g);
            if (totalM) totalNet = parseEuNum(totalM[totalM.length - 1]);
            state = 'TOTALS';
        }

        // ─ Client refs / project (lines before items, indented) ─
        if (state === 'LINES' && /^\s{10,}/.test(line) && !SKU_START_RE.test(trimmed)) {
            const ref = trimmed;
            if (/Vs\.\s*Rif\.|Ref\.|pedido\s+\d/i.test(ref) || /Or\.\s*Cl\./i.test(ref)) {
                let clean = ref;
                if (options.cleanRef) {
                    clean = ref.replace(/^(Vs\.\s*Rif\.|Vs\s*Rif\.|Or\.\s*Cl\.|Vs\.\s*Rif|Ref\.)\s*/i, '').trim();
                }
                if (!clientRef) clientRef = clean;
                else clientRef += ' | ' + clean;
            } else if (ref && !projectNote && !/^REF\.|^N\.\s*\d/.test(ref)) {
                projectNote = ref;
            }
            // If it's currently appending description to a line
            if (currentLine) {
                currentLine.description += ' ' + ref;
            }
            continue;
        }

        // ─ Item lines ─
        if (state === 'LINES') {
            const skuMatch = trimmed.match(/^([A-Z][A-Z0-9._/\\-]{2,})\s{2,}/);
            if (skuMatch) {
                // Parse all numbers from the right side of the line
                const nums = trimmed.match(/[\d,.]+/g) || [];
                const sku = skuMatch[1];
                const rest = trimmed.slice(sku.length).trim();

                // Try to extract qty, unitPrice, disc1, disc2, lineTotal
                let qty = 0, unitPrice = 0, disc1 = 0, disc2 = 0, lineTotal = 0;
                const numsRight = [];

                // Extract numbers ONLY from the right-hand numeric tail (after 'N.')
                // This avoids matching digits from the description (e.g. '2350')
                const numTailIdx = rest.search(/\s+N\.\s+/);
                const numTail = numTailIdx >= 0 ? rest.substring(numTailIdx) : rest;
                const numberRe = /[\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?/g;
                const allNums = [...numTail.matchAll(numberRe)].map(m => m[0]);

                // FIMA OC/Proforma columns (from left): qty  unitPrice  disc1  [disc2]  total
                if (allNums.length >= 5) {
                    qty = parseEuNum(allNums[0]);
                    unitPrice = parseEuNum(allNums[1]);
                    disc1 = parseEuNum(allNums[2]);
                    disc2 = parseEuNum(allNums[3]);
                    lineTotal = parseEuNum(allNums[allNums.length - 1]);
                } else if (allNums.length >= 4) {
                    // qty  unitPrice  disc1  total  (no disc2)
                    qty = parseEuNum(allNums[0]);
                    unitPrice = parseEuNum(allNums[1]);
                    disc1 = parseEuNum(allNums[2]);
                    lineTotal = parseEuNum(allNums[3]);
                } else if (allNums.length === 3) {
                    qty = parseEuNum(allNums[0]);
                    unitPrice = parseEuNum(allNums[1]);
                    lineTotal = parseEuNum(allNums[2]);
                }

                // Description = everything between sku and first number group
                const firstNumIdx = rest.search(/\s+N\.\s+|\s+[\d,.]{3,}/);
                let description = firstNumIdx > 0 ? rest.substring(0, firstNumIdx).trim() : rest.replace(/\s+[\d,.]+.*/, '').trim();

                currentLine = {
                    sku,
                    description,
                    unit: 'N.',
                    quantity: qty,
                    unitPrice,
                    discount1: disc1,
                    discount2: disc2,
                    total: lineTotal || parseFloat((qty * unitPrice * (1 - disc1 / 100) * (1 - disc2 / 100)).toFixed(2))
                };
                parsedLines.push(currentLine);
            } else if (currentLine && /^\s{10,}/.test(line) && trimmed && !TABLE_HEADER_RE.test(trimmed)) {
                // Continuation line — append to last description
                if (!/^(N\.|N°|Pag\.|[A-Z]{2,}\s+\d)/.test(trimmed)) {
                    currentLine.description += ' ' + trimmed;
                }
            }
        }
    }  // end for loop

    // ─── Full-text header metadata extraction (robust: covers both Proforma and OC) ──
    const headerBlock = rawText.split(/Condigo\s+Art/i)[0] || rawText.substring(0, 3000);

    if (!orderNumber) {
        // Doc number: \d{2,5}/\d{2} in header block
        // Proforma: appears after PT XXXXXXXXX on same line, e.g. "PT 515226963   1058/00   26/02/2026"
        // OC: appears first on data line, e.g. "6361/00   03/03/2026   515226963"
        const dnMatch =
            headerBlock.match(/\b(\d{2,5}\/\d{2})\s{2,}(\d{2}\/\d{2}\/\d{4})/) ||
            headerBlock.match(/N°[\s\S]{0,300}?(\d{2,5}\/\d{2})[\s\S]{0,100}?(\d{2}\/\d{2}\/\d{4})/i);
        if (dnMatch) { orderNumber = dnMatch[1]; docDate = dnMatch[2]; }
    }

    if (!docDate) {
        const dtM = headerBlock.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dtM) docDate = dtM[1];
    }
    if (!customerVat) {
        const vatM = headerBlock.match(/\bPT\s+(\d{9})\b/) || headerBlock.match(/\b(\d{9})\b/);
        if (vatM) customerVat = vatM[1];
    }
    if (!shippingMethod) {
        const envM = headerBlock.match(/A\s+MEZZO\s+CORRIERE[^\r\n]*/i);
        if (envM) shippingMethod = envM[0].trim();
    }
    if (!shippingTerms) {
        const porteM = headerBlock.match(/(PORTOFRANCO[^\r\n]*|DAP[^\r\n]*|DDP[^\r\n]*|CIF[^\r\n]*|FOB[^\r\n]*)/i);
        if (porteM) shippingTerms = porteM[1].trim();
    }
    if (!paymentCondition) {
        const pagoM = headerBlock.match(/Cod\.?\s*Pago[^\r\n]*[\r\n]+([^\r\n]{1,120})/i) ||
            headerBlock.match(/(\d{2}\s*100%\s*T\.?T\.?[^\r\n]{0,40})/i);
        if (pagoM) {
            paymentCondition = pagoM[1]
                .replace(/\s{8,}[\s\S]*$/, '')       // strip right-column data (large whitespace gap)
                .replace(/\s+Banco[\s\S]*/i, '')      // strip Banco and anything after
                .replace(/\s+IBAN[\s\S]*/i, '')       // strip IBAN and anything after
                .replace(/\s+INTESA[\s\S]*/i, '')     // strip bank name if it bleeds through
                .trim();
        }
    }
    if (!expeditionWeek) {
        const expM = headerBlock.match(/EXPEDICION[:\s]+([^\r\n]{1,30})/i) ||
            headerBlock.match(/semana\s+(\d+)/i);
        if (expM) expeditionWeek = expM[0].trim();
    }


    // ─── Ensure totals from lines if header not captured ─────────────
    if (!totalNet && parsedLines.length > 0) {
        totalNet = parsedLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
    }

    return {
        docType: 'fima_c_pedido',
        supplier: 'FIMA',
        metadata: {
            doc_number: orderNumber,
            doc_date: docDate,
            customer_vat: customerVat,
            shipping_method: shippingMethod,
            shipping_terms: shippingTerms,
            payment_condition: paymentCondition,
            expedition_week: expeditionWeek,
            client_ref: clientRef,
            project_note: projectNote,
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
            net: parseFloat(totalNet).toFixed(2),
            vat: 0,
            transport: 0,
            gross: parseFloat(totalNet).toFixed(2),
            total: parseFloat(totalNet).toFixed(2)
        }
    };
}

module.exports = { processOrderConfirmation, parseOrderConfirmation };
