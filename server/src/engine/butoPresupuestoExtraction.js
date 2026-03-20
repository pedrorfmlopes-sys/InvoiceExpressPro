/**
 * BUTÖ — Extrator de PRESUPUESTO (Proposta de Venda)
 * Documento identificado por: BUTO + PRESUPUESTO
 * Layout extraído via Poppler -layout
 */
const { pdfBufferToTextPoppler } = require('../utils/popplerText');
const { normalizeDate, normalizeAmount } = require('./normalize');

function toNum(raw) {
    if (!raw) return 0;
    const s = (raw + '').trim().replace(/\s/g, '');
    // Buto: "1.250,00" → dot=thousands, comma=decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return normalizeAmount(s.replace(/\./g, '') + ',00');
    return normalizeAmount(s);
}

function parseLine(line) {
    // Split on 3+ spaces preserving internal single-space content
    const cols = line.split(/\s{3,}/).map(c => c.trim()).filter(c => c);
    return cols;
}

async function processPresupuesto(pdfBuffer) {
    let rawText;
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        throw new Error('Falha ao extrair texto do PDF (Poppler): ' + e.message);
    }

    const result = {
        docType: 'quote',
        docNumber: null,
        dates: { issued: null, deliveryEstimate: null },
        entities: {
            supplier: { name: 'BUTO DESIGN S.L.', vat: 'ESB02883957', address: 'C/ Soc. Cultural Deportiva Betis Florida 3, 03007 Alicante, España' },
            customer: { name: null, vat: null, address: null, phone: null, email: null }
        },
        totals: { gross: 0, totalDiscount: 0, additionalDiscount: 0, additionalDiscountPct: 0, subtotal: 0, transport: 0, total: 0, currency: 'EUR' },
        lines: [],
        docRefs: { linkedOrder: null, linkedInvoice: null },
        shippingMarks: null,
        validez: null
    };

    const lines = rawText.split(/\r?\n/);

    // === METADATA ===
    // Customer block: lines between CLIENTE and the header row
    let inCustomerBlock = false;
    let custLines = [];
    let refClienteLines = [];
    let collectingRef = false;

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        // Doc Number & Date
        if (/Presupuesto de venta/i.test(l)) {
            const m = l.match(/(INT\/\d{2}-\d{6})/);
            if (m) result.docNumber = m[1];
        }
        if (/Fecha\s+(\d{2}\/\d{2}\/\d{4})/.test(l)) {
            const m = l.match(/Fecha\s+(\d{2}\/\d{2}\/\d{4})/);
            if (m) result.dates.issued = normalizeDate(m[1]);
        }
        if (/Fecha salida/i.test(l)) {
            const m = l.match(/Fecha salida\s+(.+)/);
            if (m) result.dates.deliveryEstimate = m[1].trim().replace(/\s{2,}.*/, '');
        }

        // Customer block start
        if (/^CLIENTE\s*$/i.test(l.trim().split(/\s{5,}/)[0])) {
            inCustomerBlock = true;
            continue;
        }
        if (inCustomerBlock && /UD\.\s+COD\./i.test(l)) {
            inCustomerBlock = false;
        }
        if (inCustomerBlock) {
            const leftPart = l.substring(0, 70).trim();
            if (leftPart) custLines.push(leftPart);
        }

        // Ref. Cliente (can span multiple lines on the right side)
        if (/Ref\.\s*Cliente/i.test(l)) {
            const refMatch = l.match(/Ref\.\s*Cliente\s+(.+)/);
            if (refMatch) {
                const refVal = refMatch[1].trim().split(/\s{2,}/)[0];
                if (refVal) refClienteLines.push(refVal);
            }
            collectingRef = true;
            continue;
        }
        if (collectingRef) {
            const rightPart = l.trim();
            if (rightPart && !/UD\.|COD\.|DESCRIP|Validez|GRACIAS|Total|Fecha/i.test(rightPart) && /^[A-ZÁÉÍÓÚÑ]/.test(rightPart) && rightPart.length < 50) {
                refClienteLines.push(rightPart);
            } else {
                collectingRef = false;
            }
        }

        // Totals
        if (/Total Bruto/i.test(l)) {
            const m = l.match(/([\d.,]+)\s*$/);
            if (m) result.totals.gross = toNum(m[1]);
        }
        if (/Total Descuento/i.test(l)) {
            const m = l.match(/(-?[\d.,]+)\s*$/);
            if (m) result.totals.totalDiscount = toNum(m[1].replace('-', ''));
        }
        if (/Dto\.\s*Adicional/i.test(l)) {
            const pctM = l.match(/(\d+(?:[,.]\d+)?)\s*%/);
            if (pctM) result.totals.additionalDiscountPct = parseFloat(pctM[1].replace(',', '.'));
            const amtM = l.match(/(-?[\d.,]+)\s*$/);
            if (amtM) result.totals.additionalDiscount = toNum(amtM[1].replace('-', ''));
        }
        if (/Base imponible|Base Imponible/i.test(l)) {
            const m = l.match(/([\d.,]+)\s*$/);
            if (m) result.totals.subtotal = toNum(m[1]);
        }
        if (/Total \(€\)/i.test(l)) {
            const m = l.match(/([\d.,]+)\s*$/);
            if (m) result.totals.total = toNum(m[1]);
        }
        if (/Portes|Flete/i.test(l)) {
            const m = l.match(/([\d.,]+)\s*$/);
            if (m) result.totals.transport = toNum(m[1]);
        }

        // Validez
        if (/Validez de presupuesto/i.test(l)) {
            const m = l.match(/Validez de presupuesto\s*[:\.]*\s*(.+)/);
            if (m) result.validez = m[1].trim();
        }
    }

    // Parse customer block
    if (custLines.length > 0) {
        result.entities.customer.name = custLines[0];
        const addressLines = [];
        for (const cl of custLines.slice(1)) {
            if (/^NIF:\s*/i.test(cl)) { result.entities.customer.vat = cl.replace(/^NIF:\s*/i, '').trim(); }
            else if (/^Tel:/i.test(cl)) { result.entities.customer.phone = cl.replace(/^Tel:\s*/i, '').trim(); }
            else if (/^Mail:/i.test(cl)) { result.entities.customer.email = cl.replace(/^Mail:\s*/i, '').trim(); }
            else { addressLines.push(cl); }
        }
        result.entities.customer.address = addressLines.join(', ');
    }

    // Ref. Cliente → shippingMarks
    if (refClienteLines.length > 0) {
        result.shippingMarks = refClienteLines.join(' ').trim();
    }


    // === TABLE PARSING ===
    let inTable = false;
    let lastLine = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        if (!inTable) {
            if (/UD\.\s+COD\.\s+DESCRIP/i.test(raw)) {
                inTable = true;
            }
            continue;
        }

        // Stop words
        if (/Resumen|GRACIAS|Total Bruto|Total Descuento|Base imponible|Base Imponible|Dto\. Adicional|Validez/i.test(raw)) break;
        if (!raw.trim()) continue;

        const cols = parseLine(raw);
        if (!cols.length) continue;

        // Item line: starts with quantity
        const firstIsNum = /^\d+$/.test(cols[0]);

        if (firstIsNum) {
            // Structure: [qty, cod, desc, [detalle], acabado, precio, [inc%], total, dto%, subtotal]
            const qty = parseInt(cols[0], 10);
            const sku = cols[1] || '';
            const desc = cols[2] || '';

            let detailCode = null;
            let finishCode = null;
            let basePrice = 0;
            let incrementPercent = 0;
            let totalBeforeDto = 0;
            let discountPercent = 0;
            let total = 0;

            // Remaining cols after desc: detalle?, acabado, precio, inc?, total, dto%, subtotal
            const rest = cols.slice(3);
            const numericCols = rest.filter(c => /^[\d.,]+%?$/.test(c.replace('%', '')));
            const textCols = rest.filter(c => !/^[\d.,]+%?$/.test(c.replace('%', '')) && c);

            if (textCols.length >= 2) {
                detailCode = textCols[0];
                finishCode = textCols[1];
            } else if (textCols.length === 1) {
                finishCode = textCols[0];
            }

            // Numeric: precio, [inc], total, dto%, subtotal
            const nums = rest.filter(c => /^[\d.]+,\d{2}$/.test(c) || /^\d+$/.test(c) || /^\d+%$/.test(c));
            
            // Reparse right-to-left: subtotal, dto%, total, inc?, precio
            const rawNums = rest.filter(c => /^[\d.,]+%?$/.test(c));
            if (rawNums.length >= 3) {
                total = toNum(rawNums[rawNums.length - 1]);
                const dtoRaw = rawNums[rawNums.length - 2];
                discountPercent = parseFloat(dtoRaw.replace('%', '').replace(',', '.')) || 0;
                totalBeforeDto = toNum(rawNums[rawNums.length - 3]);
                if (rawNums.length >= 5) {
                    // [precio, inc, total, dto%, subtotal]
                    incrementPercent = parseInt(rawNums[rawNums.length - 4], 10) || 0;
                    basePrice = toNum(rawNums[rawNums.length - 5]);
                } else if (rawNums.length >= 4) {
                    // [precio, total, dto%, subtotal]
                    basePrice = toNum(rawNums[rawNums.length - 4]);
                }
            }

            lastLine = { quantity: qty, code: sku, description: desc, detailCode, finishCode, basePrice, incrementPercent, totalBeforeDto, discountPercent, total };
            result.lines.push(lastLine);

        } else if (lastLine && cols.length >= 1) {
            // Continuation (description, finish name, etc.) — append to last line
            const extra = cols.join(' ').trim();
            if (extra && extra.length < 100 && !/^[A-Z]{2,4} -/.test(extra)) {
                lastLine.description += ' ' + extra;
            }
        }
    }

    return result;
}

module.exports = { processPresupuesto };
