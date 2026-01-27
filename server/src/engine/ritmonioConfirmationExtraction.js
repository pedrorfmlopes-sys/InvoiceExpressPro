const { extractWithCoords } = require('../utils/pdfCoords');
const { normalizeAmount, normalizeDate } = require('./normalize');
const { pdfBufferToTextPoppler } = require("../utils/popplerText");

function debugLog(...args) {
    // console.log('[RitmonioConfirmation]', ...args);
}

/**
 * Ritmonio Order Confirmation Extraction Engine
 */
async function ritmonioConfirmationExtraction(pdfBuffer) {
    const fullText = pdfBufferToTextPoppler(pdfBuffer);
    const extracted = {
        docType: 'order_confirmation',
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null,
            subtotal: null,
            tax: null,
            total: null,
            discountMain: null
        },
        lines: [],
        entities: {
            supplier: {
                name: "Rubinetterie Ritmonio Srl",
                vat: "IT01495130021",
                address: "Via Indren 4, Zona Ind. Roccapietra - 13019 Varallo (VC) Italy"
            },
            customer: { name: null, vat: null, address: null, deliveryAddress: null }
        },
        docRefs: { customerOrder: null },
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: { extractor: 'ritmonioConfirmationExtraction' }
    };

    if (!fullText) return extracted;

    const pages = await extractWithCoords(pdfBuffer);
    const p1I = (pages && pages.length > 0) ? pages[0].items : [];

    // --- 1. Metadata Detection (Values row is ~20 units below "Cod.Cliente") ---
    const metaHeader = p1I.find(i => /Cod\.Cliente|Customer\s*code/i.test(i.str));
    if (metaHeader) {
        const metaY = metaHeader.y;
        const rowVals = p1I.filter(i => i.y < metaY - 12 && i.y > metaY - 30).sort((a, b) => a.x - b.x);

        const getValAtX = (xMin, xMax) => {
            return rowVals.filter(i => i.x >= xMin && i.x <= xMax).map(i => i.str.trim()).join(' ').trim();
        };

        const vatMatch = getValAtX(80, 170).match(/(?:PT|IT)\s?(\d{8,11})/i);
        if (vatMatch) extracted.entities.customer.vat = vatMatch[0].replace(/\s/g, '').toUpperCase();

        const docNum = getValAtX(320, 390).split(/\s+/)[0];
        if (docNum) extracted.docNumber = docNum.startsWith('OA2') ? docNum : 'OA2/' + docNum;

        extracted.dates.issued = normalizeDate(getValAtX(390, 455));

        const refStr = getValAtX(455, 600);
        if (refStr && refStr.length > 3) {
            const refParts = refStr.split('-').map(p => p.trim());
            extracted.docRefs.customerOrder = { number: refParts[0] };
            const dMatch = refStr.match(/\d{2}[\/.-]\d{2}[\/.-]\d{2,4}/);
            if (dMatch) extracted.docRefs.customerOrder.date = normalizeDate(dMatch[0]);
        }
    }

    // --- 2. Customer Name ---
    const messrsHeader = p1I.find(i => /Spettabile\/Messrs/i.test(i.str));
    if (messrsHeader) {
        const nameItems = p1I.filter(i => i.x > 270 && i.y < messrsHeader.y && i.y > (messrsHeader.y - 30));
        if (nameItems.length > 0) {
            nameItems.sort((a, b) => b.y - a.y);
            extracted.entities.customer.name = nameItems[0].str.trim();
        }
    }

    // --- 3. Addresses ---
    const stopY = metaHeader ? metaHeader.y : 670;
    const extractSpatialAddr = (anchorStr, minX, maxX) => {
        const anchor = p1I.find(i => i.str.includes(anchorStr));
        if (!anchor) return null;
        const items = p1I.filter(i =>
            i.y < anchor.y && i.y > stopY + 2 && i.x >= minX && i.x <= maxX &&
            !/Pag\.|Delivery|Messrs|Destinazione|Spettabile|Cod\.Cliente|IVA|Data|Numero|Rif\.|Vs\.|Ref\./i.test(i.str)
        );
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        let adr = items.map(i => i.str.trim()).join(' ').replace(/\s{2,}/g, ' ').trim();
        if (extracted.entities.customer.name) {
            const tokens = extracted.entities.customer.name.split(/[\s,().]+/).filter(t => t.length > 2);
            tokens.forEach(t => { adr = adr.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''); });
        }
        return adr.replace(/^[.,\s]+|[.,\s]+$/g, '').trim();
    };

    extracted.entities.customer.deliveryAddress = extractSpatialAddr("Delivery address", 20, 270);
    extracted.entities.customer.address = extractSpatialAddr("Spettabile/Messrs", 270, 600);

    // --- 4. Lines ---
    if (headerY = (p1I.find(i => /Codice\s*Articolo|Item\s*Code/i.test(i.str)) || {}).y) {
        let cols = { code: 0, qty: 0, price: 0, discount: 0, total: 0, shipDate: 0 };
        p1I.filter(i => Math.abs(i.y - headerY) < 10).forEach(i => {
            if (/Codice/i.test(i.str)) cols.code = i.x;
            if (/Quantità/i.test(i.str)) cols.qty = i.x;
            if (/Prezzo/i.test(i.str)) cols.price = i.x;
            if (/Sconto/i.test(i.str)) cols.discount = i.x;
            if (/Importo/i.test(i.str)) cols.total = i.x;
            if (/Partenza/i.test(i.str)) cols.shipDate = i.x;
        });

        const xQty = cols.qty || 350, xPrice = cols.price || 410, xDiscount = cols.discount || 480, xTotal = cols.total || 530, xShip = cols.shipDate || 600;
        const bQP = (xQty + xPrice) / 2, bPD = (xPrice + xDiscount) / 2, bDT = (xDiscount + xTotal) / 2, bTS = (xTotal + xShip) / 2;

        let lastLine = null, lastLineY = null;
        for (const page of pages) {
            const items = [...page.items].sort((a, b) => b.y - a.y);
            const fY = (items.find(i => /Totale\s*importo|Total\s*amount/i.test(i.str)) || { y: 100 }).y;
            const phY = (items.find(i => /Codice\s*Articolo/i.test(i.str)) || { y: 9999 }).y;

            let curRow = { y: -9999, items: [] }, rows = [];
            for (const it of items) {
                if (it.y > phY - 5 || it.y < fY + 2) continue;
                if (Math.abs(it.y - curRow.y) < 5) curRow.items.push(it);
                else { if (curRow.items.length > 0) rows.push(curRow); curRow = { y: it.y, items: [it] }; }
            }
            if (curRow.items.length > 0) rows.push(curRow);

            let isFirstRowOnPage = true;
            for (const row of rows) {
                row.items.sort((a, b) => a.x - b.x);
                let code = '', desc = '', qty = '', price = '', discount = '', totalStr = '', shipDateStr = '';
                row.items.forEach(i => {
                    const x = i.x, s = i.str.trim(); if (!s) return;
                    if (x < xQty - 15) { if (x < 110) code += s + ' '; else desc += s + ' '; }
                    else if (x < bQP) qty += s + ' ';
                    else if (x < bPD) price += s + ' ';
                    else if (x < bDT) discount += s + ' ';
                    else if (x < bTS) totalStr += s + ' ';
                    else shipDateStr += s + ' ';
                });

                const clean = (val) => val.replace(/[^\d,.-]/g, '');
                const hasNums = /[\d]/.test(clean(qty)) && /[\d]/.test(clean(price)) && /[\d]/.test(clean(totalStr));

                if (hasNums) {
                    const q = normalizeAmount(clean(qty)), p = normalizeAmount(clean(price)), t = normalizeAmount(clean(totalStr));
                    let dr = 0;
                    if (discount.includes('+')) {
                        let m = 1; discount.split('+').forEach(px => m *= (1 - normalizeAmount(px) / 100));
                        dr = (1 - m) * 100;
                    } else dr = normalizeAmount(discount || '0');

                    const newLine = { code: code.trim(), description: desc.trim(), quantity: q, unitPrice: p, total: t, discountPercent: dr, foreeseenShippingDate: normalizeDate(shipDateStr.trim()) };
                    extracted.lines.push(newLine);
                    lastLine = newLine; lastLineY = row.y;
                    isFirstRowOnPage = false;
                } else if (lastLine) {
                    let extra = (code + ' ' + desc).trim();
                    const isNoise = /PRESENT\s+ORDER|SHIPPING|VETTORE|CARRIER|RESA|TERMS|IMPORTO|DISCOUNT|TAXABLE|CHARGES|BANK|VAT|ANNOTAZIONI|AMOUNT|Item\s*Code|Codice\s*Articolo|Descrizione|Description|U\.M\.|Quantità|Quantity|Prezzo|Price|Sconto|Discount|Importo|Partenza\s*prevista|DELAYS|ADVISE|TRACKING|DHL|EXPRESS|MOMENT/i.test(extra);

                    // GEOMETRIC CHECK: A description continuation MUST NOT have any fragments in or beyond the Quantity column
                    // Quantity column starts around xQty. If any fragment is >= bQP, it's a full-width logistics paraphraph.
                    const isFullWidthText = row.items.some(it => it.x > bQP - 5);

                    if (extra && !extra.toLowerCase().includes('segue') && !isNoise && !isFullWidthText && (isFirstRowOnPage || Math.abs(row.y - lastLineY) < 40)) {
                        extra = extra.replace(/\b(Item Code|Codice Articolo|Descrizione|Description|U\.M\.|Quantità|Quantity|Prezzo|Price|Sconto|Discount|Importo|Partenza prevista)\b/gi, '').trim();
                        if (extra) {
                            lastLine.description += ' ' + extra.replace(/\s{2,}/g, ' ');
                            lastLineY = row.y;
                        }
                        if (isFirstRowOnPage) isFirstRowOnPage = false;
                    }
                }
            }
        }
    }

    // --- 5. Totals (Strict Alignment) ---
    const lastP = (pages && pages.length > 0) ? pages[pages.length - 1].items : [];
    const getAlignedVal = (regex, deltaX = 40) => {
        const label = lastP.find(i => regex.test(i.str));
        if (!label) return null;
        const val = lastP.find(i => Math.abs(i.x - label.x) < deltaX && (label.y - i.y) > 5 && (label.y - i.y) < 25 && /[\d,.]{2,}/.test(i.str));
        return val ? normalizeAmount(val.str) : null;
    };

    extracted.totals.goods = getAlignedVal(/Totale\s*importo|Total\s*amount/i, 30);
    extracted.totals.transport = getAlignedVal(/Spese\s*trasporto|Transport\s*charges/i, 20) || 0;
    extracted.totals.discount = getAlignedVal(/Sconto[^]*Discount/i, 30) || 0;
    extracted.totals.total = getAlignedVal(/Totale\s*documento|Total\s*amount/i, 60);

    const sumLines = extracted.lines.reduce((acc, l) => acc + l.total, 0);
    if (!extracted.totals.goods && sumLines > 0) extracted.totals.goods = parseFloat(sumLines.toFixed(2));
    extracted.totals.subtotal = extracted.totals.goods;

    const net = (extracted.totals.subtotal || 0) + (extracted.totals.transport || 0) - (extracted.totals.discount || 0);
    if (!extracted.totals.total) extracted.totals.total = net;
    extracted.totals.tax = parseFloat(Math.abs(extracted.totals.total - net).toFixed(2));

    extracted.confidence = extracted.lines.length > 0 && extracted.totals.total ? 0.99 : 0.5;
    extracted.needsReview = extracted.confidence < 0.9;
    return extracted;
}

module.exports = ritmonioConfirmationExtraction;
