/**
 * BUTÖ — Extrator de FACTURA (Fatura de Venda)
 * Documento identificado por: BUTO + FACTURA
 * Layout extraído via Poppler -layout
 */
const { pdfBufferToTextPoppler } = require('../utils/popplerText');
const { normalizeDate, normalizeAmount } = require('./normalize');

function toNum(raw) {
    if (!raw) return 0;
    const s = (raw + '').trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return normalizeAmount(s.replace(/\./g, '') + ',00');
    return normalizeAmount(s);
}

function parseLine(line) {
    return line.split(/\s{3,}/).map(c => c.trim()).filter(c => c);
}

async function processFactura(pdfBuffer) {
    let rawText;
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        throw new Error('Falha ao extrair texto do PDF (Poppler): ' + e.message);
    }

    const result = {
        docType: 'invoice',
        docNumber: null,
        dates: { issued: null },
        entities: {
            supplier: { name: 'BUTO DESIGN S.L.', vat: 'ESB02883957', address: 'C/ Soc. Cultural Deportiva Betis Florida 3, 03007 Alicante, España' },
            customer: { name: null, vat: null, address: null, phone: null, email: null }
        },
        totals: { gross: 0, totalDiscount: 0, additionalDiscount: 0, additionalDiscountPct: 0, subtotal: 0, transport: 0, total: 0, currency: 'EUR' },
        lines: [],
        docRefs: { linkedOrder: null, linkedPresupuesto: null },
        shippingMarks: null,
        paymentMethod: null,
        vencimientos: null
    };

    const lines = rawText.split(/\r?\n/);

    // === METADATA ===
    let inCustomerBlock = false;
    let custLines = [];
    let refClienteLines = [];
    let collectingRef = false;

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        if (/Factura de venta/i.test(l)) {
            const m = l.match(/(INT\/\d{2}-\d{6})/);
            if (m) result.docNumber = m[1];
        }
        if (/Fecha\s+(\d{2}\/\d{2}\/\d{4})/.test(l)) {
            const m = l.match(/Fecha\s+(\d{2}\/\d{2}\/\d{4})/);
            if (m && !result.dates.issued) result.dates.issued = normalizeDate(m[1]);
        }

        if (/Fecha salida/i.test(l)) {
            const m = l.match(/Fecha salida\s+(.+)/);
            if (m) result.dates.deliveryEstimate = m[1].trim().replace(/\s{2,}.*/, '');
        }
        if (/^CLIENTE\s*$/i.test(l.trim().split(/\s{5,}/)[0])) { inCustomerBlock = true; continue; }
        if (inCustomerBlock && /UD\.\s+COD\./i.test(l)) { inCustomerBlock = false; }
        if (inCustomerBlock) { const lp = l.substring(0, 70).trim(); if (lp) custLines.push(lp); }

        if (/Ref\.\s*Cliente/i.test(l)) {
            const refMatch = l.match(/Ref\.\s*Cliente\s+(.+)/);
            if (refMatch) { const v = refMatch[1].trim().split(/\s{2,}/)[0]; if (v) refClienteLines.push(v); }
            collectingRef = true; continue;
        }
        if (collectingRef) {
            const rp = l.trim();
            if (rp && !/UD\.|COD\.|DESCRIP|GRACIAS|Total|Fecha|Nº/i.test(rp) && /^[A-ZÁÉÍÓÚÑ0-9]/.test(rp) && rp.length < 50) refClienteLines.push(rp);
            else collectingRef = false;
        }

        // Cross-document refs
        if (/Nº Pedido:/i.test(l)) {
            const m = l.match(/Nº Pedido:\s*(INT\/\d{2}-\d{6})/);
            if (m) result.docRefs.linkedOrder = m[1];
        }

        // Payment
        if (/Forma de Pago/i.test(l)) {
            const m = l.match(/Forma de Pago:\s+([^V]+)/i);
            if (m) result.paymentMethod = m[1].trim();
        }
        if (/Vencimientos:/i.test(l)) {
            const m = l.match(/Vencimientos:\s+(.+?)(?:\s{4,}|$)/);
            if (m) result.vencimientos = m[1].trim();
        }

        if (/Total Bruto/i.test(l)) { const m = l.match(/([\d.,]+)\s*$/); if (m) result.totals.gross = toNum(m[1]); }
        if (/Total Descuento/i.test(l)) { const m = l.match(/(-?[\d.,]+)\s*$/); if (m) result.totals.totalDiscount = toNum(m[1].replace('-', '')); }
        if (/Dto\.\s*Adicional/i.test(l)) {
            const pM = l.match(/(\d+(?:[,.]\d+)?)\s*%/); if (pM) result.totals.additionalDiscountPct = parseFloat(pM[1].replace(',', '.'));
            const aM = l.match(/(-?[\d.,]+)\s*$/); if (aM) result.totals.additionalDiscount = toNum(aM[1].replace('-', ''));
        }
        if (/Base imponible|Base Imponible/i.test(l)) { const m = l.match(/([\d.,]+)\s*$/); if (m) result.totals.subtotal = toNum(m[1]); }
        if (/Total \(€\)/i.test(l)) { const m = l.match(/([\d.,]+)\s*$/); if (m) result.totals.total = toNum(m[1]); }
        if (/Portes|Flete/i.test(l)) { const m = l.match(/([\d.,]+)\s*$/); if (m) result.totals.transport = toNum(m[1]); }
    }

    if (custLines.length > 0) {
        result.entities.customer.name = custLines[0];
        const addrLines = [];
        for (const cl of custLines.slice(1)) {
            if (/^NIF:/i.test(cl)) result.entities.customer.vat = cl.replace(/^NIF:\s*/i, '').trim();
            else if (/^Tel:/i.test(cl)) result.entities.customer.phone = cl.replace(/^Tel:\s*/i, '').trim();
            else if (/^Mail:/i.test(cl)) result.entities.customer.email = cl.replace(/^Mail:\s*/i, '').trim();
            else addrLines.push(cl);
        }
        result.entities.customer.address = addrLines.join(', ');
    }
    if (refClienteLines.length > 0) result.shippingMarks = refClienteLines.join(' ').trim();


    // === TABLE PARSING ===
    let inTable = false;
    let lastLine = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        if (!inTable) {
            if (/UD\.\s+COD\.\s+DESCRIP/i.test(raw)) { inTable = true; }
            continue;
        }

        if (/Resumen|GRACIAS|Total Bruto|Total Descuento|Base imponible|Base Imponible/i.test(raw)) break;
        if (!raw.trim()) continue;

        const cols = parseLine(raw);
        if (!cols.length) continue;

        const firstIsNum = /^\d+$/.test(cols[0]);

        if (firstIsNum) {
            const qty = parseInt(cols[0], 10);
            const sku = cols[1] || '';
            const desc = cols[2] || '';

            let detailCode = null, finishCode = null, basePrice = 0;
            let incrementPercent = 0, totalBeforeDto = 0, discountPercent = 0, total = 0;

            const rest = cols.slice(3);
            const textCols = rest.filter(c => !/^[\d.,]+%?$/.test(c.replace('%', '')) && c);
            const rawNums = rest.filter(c => /^[\d.,]+%?$/.test(c));

            if (textCols.length >= 2) { detailCode = textCols[0]; finishCode = textCols[1]; }
            else if (textCols.length === 1) { finishCode = textCols[0]; }

            if (rawNums.length >= 3) {
                total = toNum(rawNums[rawNums.length - 1]);
                discountPercent = parseFloat((rawNums[rawNums.length - 2] || '0').replace('%', '').replace(',', '.')) || 0;
                totalBeforeDto = toNum(rawNums[rawNums.length - 3]);
                if (rawNums.length >= 5) { incrementPercent = parseInt(rawNums[rawNums.length - 4], 10) || 0; basePrice = toNum(rawNums[rawNums.length - 5]); }
                else if (rawNums.length >= 4) { basePrice = toNum(rawNums[rawNums.length - 4]); }
            }

            lastLine = { quantity: qty, code: sku, description: desc, detailCode, finishCode, basePrice, incrementPercent, totalBeforeDto, discountPercent, total };
            result.lines.push(lastLine);
        } else if (lastLine && cols.length >= 1) {
            const extra = cols.join(' ').trim();
            if (extra && extra.length < 100) lastLine.description += ' / ' + extra;
        }
    }

    return result;
}

module.exports = { processFactura };
