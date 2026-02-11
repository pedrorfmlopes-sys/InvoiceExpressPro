const { extractWithCoords } = require('../utils/pdfCoords');
const extractNicolazziInvoice = require('./nicolazziInvoiceExtraction');
const { normalizeAmount, normalizeDate } = require('./normalize');

/**
 * Build a readable fullText from coords tokens so the legacy (regex) extractor
 * can reliably extract header/footer fields (doc number/date/customer/totals/DDT).
 */
function buildFullTextFromCoords(pages, opts = {}) {
    const yTolerance = Number.isFinite(opts.yTolerance) ? opts.yTolerance : 12;
    const pageTexts = [];

    for (const page of (pages || [])) {
        const rawItems = Array.isArray(page)
            ? page
            : (page && Array.isArray(page.items) ? page.items : []);

        if (!rawItems || rawItems.length === 0) {
            pageTexts.push('');
            continue;
        }

        const items = rawItems
            .filter(it => it && typeof it.str === 'string' && it.str.trim() !== '')
            .map(it => ({ str: it.str.trim(), x: it.x ?? 0, y: it.y ?? 0 }))
            // Top-to-bottom then left-to-right
            .sort((a, b) => (a.y - b.y) || (a.x - b.x));

        // Bucket by Y into visual lines
        const buckets = [];
        for (const it of items) {
            const last = buckets[buckets.length - 1];
            if (!last || Math.abs(it.y - last.y) > yTolerance) {
                buckets.push({ y: it.y, parts: [it] });
            } else {
                last.parts.push(it);
            }
        }

        const lines = buckets.map(b =>
            b.parts
                .sort((a, b) => a.x - b.x)
                .map(p => p.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
        );

        pageTexts.push(lines.join('\n'));
    }

    return pageTexts.join('\n\n');
}

function extractDeliveryNoteFromText(fullText) {
    if (!fullText) return null;
    // Example: "DDT Nr. 000067 del 20/01/2026"
    const m = fullText.match(/DDT\s*Nr\.?\s*([0-9]{3,})\s*del\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) return null;
    return {
        number: m[1],
        date: normalizeDate(m[2]),
        rawLine: m[0].replace(/\s+/g, ' ').trim()
    };
}

function extractDocNumberAndDateFromText(fullText) {
    if (!fullText) return { docNumber: null, issued: null };

    // Typical Nicolazzi invoice layout:
    // 000049/B
    // Numero/ Number
    // 15/01/2025
    // Data/ Date
    const docMatch = fullText.match(/(\d{6}\/\s*[A-Z])\s*\n\s*Numero\s*\/\s*Number/i);
    const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})\s*\n\s*Data\s*\/\s*Date/i);

    return {
        docNumber: docMatch ? docMatch[1].replace(/\s+/g, '') : null,
        issued: dateMatch ? normalizeDate(dateMatch[1]) : null
    };
}

function extractCustomerFromText(fullText) {
    if (!fullText) return { name: null, vat: null, address: null };

    const lines = fullText.split(/\n+/).map(s => s.trim()).filter(Boolean);

    // VAT: e.g. PT503031542 then "P.IVA"
    const vatMatch = fullText.match(/((?:PT|IT)\d{8,})\s*\n\s*P\.?IVA/i);
    const vat = vatMatch ? vatMatch[1] : null;

    // Name: pick the first plausible company line near the top, excluding NICOLAZZI and obvious labels.
    let name = null;
    const head = lines.slice(0, 120);

    for (const line of head) {
        const upper = line.toUpperCase();

        if (upper.includes('NICOLAZZI')) continue;
        if (upper.includes('S.P.A')) continue;
        if (upper.length < 6) continue;

        const looksLikeLabel =
            /^(FATTURA|INVOICE|PAG\.|PRIVACY|NUMERO|NUMBER|DATA|DATE|CONDIZIONE|PAYMENT|CODICE|BANCA|AGENTE|PORTO|ANNOTAZIONI|RIFERIMENTO)/i.test(line);

        if (looksLikeLabel) continue;

        const looksLikeCompany =
            /(LDA|L\.DA|UNIP|LTD|S\.R\.L|SRL|S\.A\.|\bSA\b)/.test(upper);

        if (looksLikeCompany) {
            name = line;
            break;
        }
    }

    return { name, vat, address: null };
}

function computeTotalsFromLines(lines) {
    const totals = {
        goods: null,
        transport: null,
        packaging: null,
        discount: null,
        subtotal: null,
        tax: null,
        total: null,
        discountMain: null,
        discountExtra: null
    };

    if (!Array.isArray(lines) || lines.length === 0) return totals;

    const sum = lines.reduce((acc, ln) => {
        const v = typeof ln.total === 'number' ? ln.total : (ln.total ? Number(ln.total) : NaN);
        return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

    if (Number.isFinite(sum) && sum > 0) {
        // Nicolazzi NI41 usually means tax exempt; set 0 tax
        const allNI = lines.every(ln => typeof ln.taxCode === 'string' && ln.taxCode.toUpperCase().startsWith('NI'));
        totals.subtotal = Number(sum.toFixed(2));
        totals.total = Number(sum.toFixed(2));
        totals.tax = allNI ? 0 : null;
    }

    return totals;
}

async function nicolazziInvoiceCoordsExtraction(pdfBuffer) {
    const pages = await extractWithCoords(pdfBuffer);
    if (!pages || pages.length === 0) return null;

    // --- Header/Footer via Legacy extractor ---
    const fullText = buildFullTextFromCoords(pages, { yTolerance: 12 });
    const legacy = extractNicolazziInvoice(fullText);

    if (!legacy) return null;
    if (legacy.docType === 'proforma') return null;

    // 1) Base output schema
    const extracted = {
        docType: 'invoice',
        docNumber: null,
        dates: { issued: null, due: null },
        docRefs: { deliveryNote: null },
        totals: { total: null, subtotal: null, tax: null },
        lines: [],
        entities: {
            supplier: { name: "NICOLAZZI s.p.a.", vat: "IT00115930034", address: "28010 ALZO (NO) - Via P. Durio, 119" },
            customer: { name: null, vat: null, address: null }
        },
        confidence: 0,
        needsReview: false,
        reviewReason: null,
        debug: { extractor: 'nicolazziInvoiceCoordsExtraction' }
    };

    // 2) Merge legacy header/footer
    if (legacy.docNumber) extracted.docNumber = legacy.docNumber;
    if (legacy.dates) extracted.dates = legacy.dates;
    if (legacy.entities && legacy.entities.customer) extracted.entities.customer = legacy.entities.customer;
    if (legacy.totals) extracted.totals = legacy.totals;

    // 2b) Fallback for DocNum/Dates/Customer
    if (!extracted.docNumber || !extracted.dates || !extracted.dates.issued) {
        const dd = extractDocNumberAndDateFromText(fullText);
        if (!extracted.docNumber && dd.docNumber) extracted.docNumber = dd.docNumber;
        if (dd.issued) extracted.dates = { ...(extracted.dates || { issued: null, due: null }), issued: dd.issued };
    }
    if (!extracted.entities.customer || !extracted.entities.customer.name || !extracted.entities.customer.vat) {
        const c = extractCustomerFromText(fullText);
        extracted.entities.customer = {
            ...(extracted.entities.customer || { name: null, vat: null, address: null }),
            name: extracted.entities.customer && extracted.entities.customer.name ? extracted.entities.customer.name : c.name,
            vat: extracted.entities.customer && extracted.entities.customer.vat ? extracted.entities.customer.vat : c.vat,
            address: extracted.entities.customer && extracted.entities.customer.address ? extracted.entities.customer.address : c.address
        };
    }

    // 3) Delivery note (DDT)
    if (legacy.docRefs && legacy.docRefs.deliveryNote) {
        const dn = legacy.docRefs.deliveryNote;
        extracted.docRefs.deliveryNote = {
            number: dn.number || null,
            date: dn.date || null,
            rawLine: dn.rawLine || dn.raw || null
        };
    }
    if (!extracted.docRefs.deliveryNote) {
        const dn = extractDeliveryNoteFromText(fullText);
        if (dn) extracted.docRefs.deliveryNote = dn;
    }

    // --- Body (lines) via coords ---
    const page1 = Array.isArray(pages[0]) ? pages[0] : (pages[0] && pages[0].items ? pages[0].items : null);
    if (!page1) return null;

    // Sort consistent
    page1.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
        return a.y - b.y;
    });

    // Detect header row
    let headerY = null;
    const cols = { code: 0, desc: 0, ref: 0, qty: 0, price: 0, total: 0 };
    for (const item of page1) {
        if (typeof item.str === 'string' && item.str.includes('Descrizione')) {
            const rowY = item.y;
            const rowItems = page1.filter(i => Math.abs(i.y - rowY) < 5);
            if (rowItems.some(i => /Articolo|Codice/i.test(i.str))) {
                headerY = rowY;
                rowItems.forEach(i => {
                    const t = i.str || '';
                    if (/Articolo/i.test(t)) cols.code = i.x;
                    else if (/Descrizione/i.test(t)) cols.desc = i.x;
                    else if (/Ref/i.test(t)) cols.ref = i.x;
                    else if (/Qta|Quantit/i.test(t)) cols.qty = i.x;
                    else if (/Valore/i.test(t)) cols.price = i.x;
                    else if (/IMPORTO|Totale/i.test(t)) cols.total = i.x;
                });
                break;
            }
        }
    }
    if (!headerY) return null;

    // Column boundaries
    const xCode = cols.code || 20;
    const xDesc = cols.desc || 150;
    const xRef = cols.ref || 300;
    const xQty = cols.qty || 400;
    const xPrice = cols.price || 450;
    const xTotal = cols.total || 500;
    const bCodeDesc = (xCode + xDesc) / 2;
    const bDescRef = cols.ref ? (xDesc + xRef) / 2 : (xDesc + xQty) / 2;
    const bRefQty = cols.ref ? (xRef + xQty) / 2 : bDescRef;
    const bQtyPrice = (xQty + xPrice) / 2;
    const bPriceTotal = (xPrice + xTotal) / 2;

    let lastLine = null;
    let lastLineY = null;

    for (const page of pages) {
        const items = Array.isArray(page) ? page : (page && page.items ? page.items : []);
        if (!items || items.length === 0) continue;

        items.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
            return a.y - b.y;
        });

        let currentRow = { y: -999999, items: [] };
        const rows = [];
        for (const it of items) {
            const pageNo = page && page.page ? page.page : null;
            if (pageNo === 1 && it.y < headerY + 5) continue;
            if (Math.abs(it.y - currentRow.y) < 5) {
                currentRow.items.push(it);
            } else {
                if (currentRow.items.length > 0) rows.push(currentRow);
                currentRow = { y: it.y, items: [it] };
            }
        }
        if (currentRow.items.length > 0) rows.push(currentRow);

        for (const row of rows) {
            row.items.sort((a, b) => a.x - b.x);
            const rowText = row.items.map(i => i.str).join(' ');

            if (/Totale|Scadenza|Transport|Porto|Industria|Non Imp|ART\.|D\.L\.|Privacy|Pagina|Pag\.|Page|Segue|continua/i.test(rowText)) continue;
            const safeRow = rowText.replace(/\s+/g, '');
            if (extracted.docNumber && safeRow.includes(String(extracted.docNumber).replace(/\s+/g, ''))) continue;
            if (extracted.entities.customer && extracted.entities.customer.name) {
                const safeName = String(extracted.entities.customer.name).replace(/\s+/g, '');
                if (safeName && safeRow.includes(safeName)) continue;
            }

            let code = '', desc = '', ref = '', qty = '', price = '', total = '';
            row.items.forEach(i => {
                const x = i.x;
                const s = (i.str || '').trim();
                if (!s) return;
                if (x < bCodeDesc) code += s + ' ';
                else if (x < bDescRef) desc += s + ' ';
                else if (x < bRefQty) {
                    if (cols.ref) ref += s + ' ';
                    else desc += s + ' ';
                } else if (x < bQtyPrice) qty += s + ' ';
                else if (x < bPriceTotal) price += s + ' ';
                else total += s + ' ';
            });
            code = code.trim(); desc = desc.trim(); ref = ref.trim(); qty = qty.trim(); price = price.trim(); total = total.trim();

            const isDate = (s) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s);
            const isVAT = (s) => /^(PT|IT)\d+/.test(s);
            const looksLikeMoney = (s) => /[\d.]+,\d{2}/.test(s) || s === '0';
            const hasFinancials = (looksLikeMoney(price) || looksLikeMoney(total)) && !isDate(price) && !isDate(total) && !isVAT(price) && !isVAT(total);

            if (hasFinancials && (/\d/.test(qty) || /\d/.test(price))) {
                const p = normalizeAmount(price);
                const t = normalizeAmount(total);
                let q = 1, uom = null;
                const mQ = qty.match(/([A-Z]{2})?\s*(\d+)/i);
                if (mQ) { if (mQ[1]) uom = mQ[1]; if (mQ[2]) q = parseInt(mQ[2], 10); }

                let taxCode = null;
                const mTax = total.match(/(NI\d+)/) || price.match(/(NI\d+)/);
                if (mTax) taxCode = mTax[1];

                const newLine = {
                    code: code, description: desc, quantity: q, unitPrice: p, total: t,
                    orderRef: ref || null, taxCode: taxCode, uom: uom
                };
                extracted.lines.push(newLine);
                lastLine = newLine;
                lastLineY = row.items[0] ? row.items[0].y : lastLineY;
            } else {
                if (!lastLine) continue;
                if (Number.isFinite(lastLineY) && row.items[0] && Math.abs(row.items[0].y - lastLineY) > 120) continue;
                const extras = [desc, ref, (code && !/DDT\s*Nr\.?/i.test(code) ? code : '')].filter(Boolean).join(' ').trim();
                if (extras) lastLine.description = (lastLine.description + ' ' + extras).replace(/\s+/g, ' ').trim();
            }
        }
    }

    // 4) Totals Fallback
    if (!extracted.totals || extracted.totals.total == null || extracted.totals.subtotal == null) {
        const computed = computeTotalsFromLines(extracted.lines);
        extracted.totals = { ...(extracted.totals || {}), ...computed };
    }

    // 5) Unit Price Fallback
    for (const ln of (extracted.lines || [])) {
        if ((ln.unitPrice == null || ln.unitPrice === 0) && Number.isFinite(ln.total) && Number.isFinite(ln.quantity) && ln.quantity > 0) {
            ln.unitPrice = Number((ln.total / ln.quantity).toFixed(2));
        }
    }

    // 6) Review flags
    const missing = [];
    if (!extracted.docNumber) missing.push('Missing Document Number');
    if (!extracted.totals || extracted.totals.total == null) missing.push('Missing Totals');
    if (missing.length) {
        extracted.needsReview = true;
        extracted.reviewReason = missing.join(', ');
    }

    extracted.confidence = Math.max(legacy.confidence || 0.95, 0.95);
    if (legacy.needsReview && !extracted.reviewReason) {
        extracted.needsReview = true;
        extracted.reviewReason = legacy.reviewReason;
    }

    return extracted;
}

module.exports = nicolazziInvoiceCoordsExtraction;
