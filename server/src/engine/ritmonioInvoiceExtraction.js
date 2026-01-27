const { extractWithCoords } = require('../utils/pdfCoords');
const { normalizeAmount, normalizeDate } = require('./normalize');
const { pdfBufferToTextPoppler } = require("../utils/popplerText");

function debugLog(...args) {
    // console.log('[RitmonioExtractor]', ...args);
}

/**
 * Ritmonio Invoice Extraction Engine (Generalized & Robust)
 */
async function ritmonioInvoiceExtraction(pdfBuffer) {
    const fullText = pdfBufferToTextPoppler(pdfBuffer);
    const extracted = {
        docType: 'invoice',
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
                vat: "IT00200844310",
                address: "Via Indipendenza 2, 13019 Varallo (VC) - ITALY"
            },
            customer: { name: null, vat: null, address: null, deliveryAddress: null }
        },
        docRefs: {},
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: { extractor: 'ritmonioInvoiceExtraction' }
    };

    if (!fullText) return extracted;

    // --- 1. Metadata Detection (Anchors) ---

    // Doc Number: Handle "FA5 / B25...", "FA5 250...", etc.
    const mNum = fullText.match(/FA5[\s/]*([A-Z0-9\s/]{5,20})/i);
    if (mNum) {
        extracted.docNumber = 'FA5/' + mNum[1].replace(/[\s/]/g, '').replace(/^B?/, '');
        // Clean up: If it's something like FA5/2504904, keep it simple.
    }

    const allDates = fullText.match(/\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4}/g);
    if (allDates && allDates.length >= 1) {
        extracted.dates.issued = normalizeDate(allDates[0]);
    }
    const mDue = fullText.match(/(?:Scadenze|Expiry date)[\s\S]{1,100}?(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/i);
    if (mDue) extracted.dates.due = normalizeDate(mDue[1]);

    // VAT
    const vats = fullText.match(/(?:PT|IT)\s?(\d{8,11})/gi);
    if (vats) {
        vats.forEach(v => {
            const cleanV = v.replace(/\s/g, '').toUpperCase();
            if (cleanV !== 'IT01495130021' && cleanV !== 'IT00200844310') extracted.entities.customer.vat = cleanV;
        });
    }

    // Name (Anchor: Area between "address" and "Cust.code")
    const mCustName = fullText.match(/Invoice address[\s\S]{1,500}?(?:C\s?\d{5}|Agente)/i);
    if (mCustName) {
        const blocks = mCustName[0].split('\n').map(l => l.trim()).filter(l => l.length > 5 && !/address|code|IVA|Fiscale|Informativa|C\s?\d{5}/i.test(l));
        if (blocks.length > 0) extracted.entities.customer.name = blocks[0];
    }
    if (!extracted.entities.customer.name) {
        const mFallName = fullText.match(/(?:DVTKB|DIVITEK|HOUSECONCEPTSTORE|FRANCISCO CONTREIRAS|SUBLIME BANHO|WATERWORKS)[^\n]*/i);
        if (mFallName) extracted.entities.customer.name = mFallName[0].trim();
    }

    // --- 2. Coords Extraction (Lines & Totals) ---
    const pages = await extractWithCoords(pdfBuffer);
    if (pages && pages.length > 0) {
        const sortFn = (a, b) => b.y - a.y;
        const p1 = pages[0].items;
        p1.sort(sortFn);
        let headerY = null;
        let cols = { code: 0, desc: 0, qty: 0, price: 0, discount: 0, total: 0 };
        const hRow = p1.filter(i => /Articolo|Item/i.test(i.str));
        if (hRow.length > 0) {
            headerY = hRow[0].y;
            p1.filter(i => Math.abs(i.y - headerY) < 10).forEach(i => {
                if (/Articolo/i.test(i.str)) cols.code = i.x;
                if (/Quant/i.test(i.str)) cols.qty = i.x;
                if (/Prezzo/i.test(i.str)) cols.price = i.x;
                if (/Sconto/i.test(i.str)) cols.discount = i.x;
                if (/Importo/i.test(i.str)) cols.total = i.x;
            });
            cols.desc = cols.code + 80;
        }

        if (headerY) {
            const xQty = cols.qty || 360;
            const xPrice = cols.price || 400;
            const xDiscount = cols.discount || 450;
            const xTotal = cols.total || 510;
            const bQtyPrice = (xQty + xPrice) / 2;
            const bPriceDiscount = (xPrice + xDiscount) / 2;
            const bDiscountTotal = (xDiscount + xTotal) / 2;

            let lastLine = null;
            let lastLineY = null;

            for (const page of pages) {
                const items = [...page.items].sort(sortFn);
                const fLabel = items.find(i => /Totale\s*Merci/i.test(i.str));
                let footerY = fLabel ? fLabel.y : 100;
                let pageHeaderY = 9999;
                const ph = items.find(i => /Articolo/i.test(i.str));
                if (ph) pageHeaderY = ph.y;

                let curRow = { y: -9999, items: [] };
                const rows = [];
                for (const it of items) {
                    if (it.y > pageHeaderY - 5 || it.y < footerY + 2) continue;
                    if (Math.abs(it.y - curRow.y) < 5) curRow.items.push(it);
                    else { if (curRow.items.length > 0) rows.push(curRow); curRow = { y: it.y, items: [it] }; }
                }
                if (curRow.items.length > 0) rows.push(curRow);

                for (const row of rows) {
                    row.items.sort((a, b) => a.x - b.x);
                    let code = '', desc = '', qty = '', price = '', discount = '', totalStr = '';
                    row.items.forEach(i => {
                        const x = i.x; const s = i.str.trim(); if (!s) return;
                        if (x < xQty - 15) { if (x < 110) code += s + ' '; else desc += s + ' '; }
                        else if (x < bQtyPrice) qty += s + ' ';
                        else if (x < bPriceDiscount) price += s + ' ';
                        else if (x < bDiscountTotal) discount += s + ' ';
                        else totalStr += s + ' ';
                    });

                    const rowText = row.items.map(i => i.str).join(' ');
                    code = code.trim(); desc = desc.trim(); qty = qty.trim(); price = price.trim(); discount = discount.trim(); totalStr = totalStr.trim();

                    if (/DDT|CONFERMA|Vs\.\s*ORDINE|CORRISPONDENTE/i.test(rowText) && !/Importo|Prezzo/i.test(rowText)) {
                        if (lastLine) lastLine.description += ' (' + rowText.trim() + ')';
                        continue;
                    }

                    const clean = (val) => val.replace(/[^\d,.-]/g, '');
                    const isNum = (val) => /[\d,.-]+/.test(val) && /\d/.test(val);

                    if (isNum(clean(qty)) && isNum(clean(price)) && (isNum(clean(totalStr)) || isNum(clean(discount)))) {
                        const q = normalizeAmount(clean(qty));
                        const p = normalizeAmount(clean(price));
                        const ct = clean(totalStr);
                        const cd = clean(discount);
                        let t = normalizeAmount(ct);
                        let dRate = 0;
                        if (cd.includes('+')) {
                            const pts = cd.split('+').map(px => normalizeAmount(px));
                            let m = 1; pts.forEach(px => m *= (1 - px / 100));
                            dRate = (1 - m) * 100;
                        } else dRate = normalizeAmount(cd || '0');

                        if (!cd && ct.length >= 4 && t > (q * p)) {
                            const mSq = ct.match(/^(\d{2})(\d+,?\d*)$/);
                            if (mSq) { dRate = normalizeAmount(mSq[1]); t = parseFloat(normalizeAmount(mSq[2]).toFixed(2)); }
                        }

                        const expected = q * p * (1 - (dRate > 0 ? dRate / 100 : 0));
                        if (Math.abs(expected - t) < 0.1) {
                            const newLine = { code, description: desc, quantity: q, unitPrice: p, total: t, discountPercent: dRate };
                            extracted.lines.push(newLine);
                            lastLine = newLine; lastLineY = row.y;
                        } else {
                            const expectedAmt = (q * p) - dRate;
                            if (Math.abs(expectedAmt - t) < 0.1) {
                                const newLine = { code, description: desc, quantity: q, unitPrice: p, total: t, discountAmount: dRate };
                                extracted.lines.push(newLine);
                                lastLine = newLine; lastLineY = row.y;
                            }
                        }
                    } else if (lastLine && Math.abs(row.y - lastLineY) < 40) {
                        const extra = (code + ' ' + desc).trim();
                        if (extra && (/[a-zA-Z]/.test(extra) || extra.includes('-') || extra.includes('/'))) {
                            lastLine.description += ' ' + extra;
                            lastLineY = row.y;
                        }
                    }
                }
            }
        }
    }

    // --- 3. Line Fallback (Regex-based, agnostic to indentation) ---
    if (extracted.lines.length === 0) {
        debugLog("Regex Fallback...");
        // Match sequence: [CODE] [DESC...] [UOM] [QTY] [PRICE] [DISC?] [TOTAL] [VAT_CODE]
        // Improved: code must NOT look like a date.
        const lineRegex = /^\s*((?!\d{2}[\/.-]\d{2}[\/.-])[A-Z0-9.\/_-]{5,})\s+(.+?)\s+([A-Z]{2})\s+([\d,.-]{1,10})\s+([\d,.-]{1,10})\s+(?:([\d,.-]+(?:\+[\d,.-]+)*)\s+)?([\d,.-]{1,10})\s+\d{3}\s*$/gm;
        let m;
        while ((m = lineRegex.exec(fullText)) !== null) {
            const [_, code, desc, uom, qtyS, priceS, discS, totalS] = m;
            const q = normalizeAmount(qtyS), p = normalizeAmount(priceS), t = normalizeAmount(totalS);
            let d = 0;
            if (discS) {
                if (discS.includes('+')) {
                    const pts = discS.split('+').map(px => normalizeAmount(px));
                    let mu = 1; pts.forEach(px => mu *= (1 - px / 100));
                    d = (1 - mu) * 100;
                } else d = normalizeAmount(discS);
            }
            extracted.lines.push({ code: code.trim(), description: desc.trim().replace(/\s{2,}/g, ' '), quantity: q, unitPrice: p, total: t, discountPercent: d });
        }
    }

    // --- 4. Global References ---
    const refText = fullText.substring(0, 12000);
    const exRef = (regex) => {
        const m = refText.match(regex);
        return m ? { number: m[1].trim(), date: normalizeDate(m[2]) } : null;
    };
    extracted.docRefs.deliveryNote = exRef(/(?:DDTCLIENTI|DDT|N\.\s*DDT)[^]*?Nr\.\s*(\d+)\s+del\s*(?:\n\s*)?(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/i);
    extracted.docRefs.orderConfirmation = exRef(/(?:CONFERMA|CONF\.)[^]*?Nr\.\s*([A-Z0-9]+)\s+del\s*(?:\n\s*)?(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/i);
    extracted.docRefs.customerOrder = exRef(/(?:Vs\.\s*ORDINE|Ordine)[^]*?Nr\.\s*([A-Z0-9]+)?\s+del\s*(?:\n\s*)?(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/i);

    // --- 5. Totals (Stable Anchors) ---
    const lastP = pages && pages.length > 0 ? pages[pages.length - 1].items : [];
    const findV = (regex, colIdx = 0) => {
        if (!lastP.length) {
            const lines = fullText.split('\n');
            const idx = lines.findIndex(l => regex.test(l));
            if (idx !== -1) {
                const searchTxt = lines.slice(idx, idx + 4).join(' ');
                const vms = searchTxt.match(/[\d.]{1,},[\d]{2}/g);
                if (vms && vms.length > colIdx) return normalizeAmount(vms[colIdx]);
                if (vms && vms.length > 0) return normalizeAmount(vms[0]);
            }
            return null;
        }
        const label = lastP.find(i => regex.test(i.str));
        if (!label) return null;
        let cs = lastP.filter(i => Math.abs(i.y - label.y) < 8 && i.x > label.x && /[\d,.]{2,}/.test(i.str));
        if (cs.length === 0) cs = lastP.filter(i => (label.y - i.y) > 5 && (label.y - i.y) < 30 && Math.abs(i.x - label.x) < 80 && /[\d,.]{2,}/.test(i.str));
        if (cs.length > 0) { cs.sort((a, b) => Math.abs(a.x - label.x) - Math.abs(b.x - label.x)); return normalizeAmount(cs[0].str); }
        return null;
    };

    extracted.totals.goods = findV(/Totale\s*Merci/i, 0);

    // Improved Transport Detection: Search for a secondary value in the footer cluster that isn't subtotal/total
    const footerLines = fullText.split('\n');
    const fIdx = footerLines.findIndex(l => /Totale\s*Merci|Spese\s*trasporto/i.test(l));
    if (fIdx !== -1) {
        const cluster = footerLines.slice(fIdx, fIdx + 5).join(' ');
        const vals = (cluster.match(/[\d.]{1,},[\d]{2}/g) || []).map(v => normalizeAmount(v));
        const otherVal = vals.find(v => v !== extracted.totals.goods && v !== extracted.totals.total && v > 0);
        if (otherVal) extracted.totals.transport = otherVal;
    }
    if (!extracted.totals.transport) extracted.totals.transport = 0;

    extracted.totals.total = findV(/Totale\s*a\s*pagare/i) || findV(/Total\s*payment/i);
    const dv = findV(/Sconto\s*\/\s*Discount/i, 1);
    if (dv && dv !== extracted.totals.goods && dv !== extracted.totals.total) extracted.totals.discount = dv; else extracted.totals.discount = 0;

    if (!extracted.totals.goods) {
        const sum = extracted.lines.reduce((acc, l) => acc + l.total, 0);
        if (sum > 0) extracted.totals.goods = parseFloat(sum.toFixed(2));
    }
    if (extracted.totals.goods && !extracted.totals.subtotal) extracted.totals.subtotal = extracted.totals.goods;
    if (extracted.totals.total && extracted.totals.subtotal) {
        const netSub = (extracted.totals.subtotal || 0) + (extracted.totals.transport || 0) - (extracted.totals.discount || 0);
        extracted.totals.tax = parseFloat(Math.abs(extracted.totals.total - netSub).toFixed(2));
    }

    // --- 6. Address Extraction (Billing & Delivery) ---
    if (pages && pages.length > 0) {
        const p1I = pages[0].items;

        const extractSpatialAddr = (anchorStr, stopRegex) => {
            const anchorItem = p1I.find(i => i.str.includes(anchorStr));
            if (!anchorItem) return null;

            const aIs = p1I.filter(i =>
                i.y < anchorItem.y && i.y > (anchorItem.y - 150) &&
                i.x < 255 &&
                !stopRegex.test(i.str) &&
                !/Pag\.|Agente|Destinazione|DVTKB|DIVITEK|HOUSE|CONTREIRAS|Modalità|Spettabile|Messrs|Tax\s*Code|P\.\s*IVA|SUBLIME|WATERWORKS|Term\s*of\s*payment|Banca|ABI|CAB|IBAN|T\/T|DAYS|END\s*MONTH/i.test(i.str)
            );
            aIs.sort((a, b) => b.y - a.y || a.x - b.x);
            let adr = aIs.map(i => i.str.trim()).join(' ');

            // Cleanup name tokens
            if (extracted.entities.customer.name) {
                const tokens = extracted.entities.customer.name.split(/[\s,().]+/).filter(t => t.length > 2);
                tokens.forEach(t => { adr = adr.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''); });
            }
            return adr.replace(/\b(?:LDA|PT\d+|Pag\.|Pagina)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
        };

        extracted.entities.customer.address = extractSpatialAddr("Invoice address", /Delivery|Delivery address|Spettabile/i);
        extracted.entities.customer.deliveryAddress = extractSpatialAddr("Delivery address", /Spettabile|Modalità|Term\s*of\s*payment|Banca|T\/T|DAYS|END\s*MONTH/i);
    }

    // Text-based Fallbacks
    if (!extracted.entities.customer.address) {
        const m = fullText.match(/Invoice address[\s\S]{1,500}?(?:Delivery|C\s?\d{5}|Agente|Term\s*of\s*payment|Banca|T\/T|DAYS|END\s*MONTH)/i);
        if (m) {
            extracted.entities.customer.address = m[0].split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 5 && !/address|Delivery|code|IVA|Fiscale|Agente|Term\s*of\s*payment|Banca|ABI|CAB|IBAN|T\/T|DAYS|END\s*MONTH/i.test(l))
                .join(' ');
        }
    }
    if (!extracted.entities.customer.deliveryAddress) {
        const m = fullText.match(/Delivery address[\s\S]{1,500}?(?:Spettabile|Modalità|Term\s*of\s*payment|Banca|T\/T|DAYS|END\s*MONTH)/i);
        if (m) {
            extracted.entities.customer.deliveryAddress = m[0].split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 5 && !/address|Spettabile|Modalità|payment|Banca|ABI|CAB|IBAN|T\/T|DAYS|END\s*MONTH/i.test(l))
                .join(' ');
        }
    }

    extracted.confidence = extracted.lines.length > 0 && extracted.totals.total ? 0.95 : 0.5;
    extracted.needsReview = extracted.lines.length === 0 || !extracted.totals.total;
    return extracted;
}

module.exports = ritmonioInvoiceExtraction;
