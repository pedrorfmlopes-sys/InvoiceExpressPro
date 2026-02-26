const { extractWithCoords } = require('../utils/pdfCoords');
const { normalizeAmount, normalizeDate } = require('./normalize');
const pdfParse = require('pdf-parse'); // We use native pdf-parse instead of poppler to avoid ENOENT errors on Windows

function debugLog(...args) {
    // console.log('[RitmonioInvoiceExtractor]', ...args);
}

/**
 * Ritmonio Invoice Extraction Engine (Geometric & Native Text)
 * Completely refactored from old Poppler-based regex to pdfCoords to survive formating variations.
 */
async function ritmonioInvoiceExtraction(pdfBuffer, providedFullText = '') {
    // 1. Get raw text using native pdf-parse (no Poppler required)
    let fullText = providedFullText;
    if (!fullText) {
        try {
            const parsed = await pdfParse(pdfBuffer);
            fullText = parsed.text;
        } catch (e) {
            console.error("Native PDF text parsing failed", e);
            fullText = '';
        }
    }

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

    // --- 1. Global Metadata (Needles in Haystack via text parsing) ---
    // Invoice Number
    const mNum = fullText.match(/FA5[\s/]*([A-Z0-9\s/]{5,20})/i);
    if (mNum) extracted.docNumber = 'FA5/' + mNum[1].replace(/[\s/]/g, '').replace(/^B?/, '');

    // Dates
    const allDates = fullText.match(/\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4}/g);
    if (allDates && allDates.length >= 1) extracted.dates.issued = normalizeDate(allDates[0]);

    // Customer References / Proposal Links! (This is what you mentioned: "Vs. CONFERMA ORD. BS ESTERO Nr. CSO1212")
    const exRef = (regex) => {
        const m = fullText.substring(0, 12000).match(regex);
        return m ? { number: m[1].trim(), date: normalizeDate(m[2] ? m[2] : "01/01/2000") } : null; // Date is optional sometimes
    };

    // Attempt multiple regexes to capture the Golden Key
    const customerOrderMatch = fullText.match(/(?:Vs\.\s*CONFERMA|Vs\.\s*ORDINE)[^\n]*?Nr\.?\s*(.*?)\s*del/i);
    if (customerOrderMatch) {
        extracted.docRefs.customerOrder = { number: customerOrderMatch[1].trim() };
    }

    // --- 2. Geometric Coordinate Extraction ---
    const pages = await extractWithCoords(pdfBuffer);
    if (!pages || pages.length === 0) return extracted;

    // Use page 1 for header anchors
    const p1I = pages[0].items;

    // Address spatial extraction (Super strict bounds to prevent bleeding)
    const extractSpatialAddr = (anchorStr, minX, maxX, deltaY = 55) => {
        const anchor = p1I.find(i => new RegExp(anchorStr, 'i').test(i.str));
        if (!anchor) return null;
        const items = p1I.filter(i =>
            i.y < anchor.y && i.y >= anchor.y - deltaY && i.x >= minX && i.x <= maxX &&
            !/Pag\.|Delivery|Messrs|Destinazione|Spettabile|Cod\.Cliente|IVA|Data|Numero|Rif\.|Vs\.|Ref\.|Agente/i.test(i.str)
        );

        // Group fragments horizontally by rounding Y to nearest 5
        const linesMap = {};
        items.forEach(i => {
            const yGroup = Math.round(i.y / 5) * 5;
            if (!linesMap[yGroup]) linesMap[yGroup] = [];
            linesMap[yGroup].push(i);
        });

        const joinedLines = Object.values(linesMap)
            .sort((a, b) => b[0].y - a[0].y) // Sort Y top-to-bottom
            .map(lineItems => {
                lineItems.sort((a, b) => a.x - b.x); // Sort X left-to-right
                return lineItems.map(i => i.str.trim()).join(' ').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1');
            });

        return joinedLines.join('\n').trim();
    };

    // Extract Delivery Column (Yellow Box)
    extracted.entities.customer.deliveryAddress = extractSpatialAddr("Delivery address", 20, 290) || "";

    // Extract Right Column (Green Box - Bill To / Spettabile)
    const billToText = extractSpatialAddr("Spettabile|Messrs", 300, 600, 65);
    if (billToText) {
        const lines = billToText.split('\n');
        extracted.entities.customer.name = lines[0].trim();
        extracted.entities.customer.address = lines.slice(1).join('\n').trim();
    } else {
        // Fallback cleaner name from text
        const nameMatch = fullText.match(/Invoice address\s*\n([^\n]+)/i) || fullText.match(/Spettabile\/Messrs\.?[^\n]*\n([^\n]+)/i);
        if (nameMatch) extracted.entities.customer.name = nameMatch[1].trim();
    }

    // Table extraction Header
    const headerRowItem = p1I.find(i => /Articolo|Item/i.test(i.str));
    if (headerRowItem) {
        let cols = { code: 0, qty: 0, price: 0, discount: 0, total: 0 };
        p1I.filter(i => Math.abs(i.y - headerRowItem.y) < 10).forEach(i => {
            if (/Articolo|Item\b/i.test(i.str)) cols.code = i.x;
            if (/Quant\w*|Q\.?ty/i.test(i.str)) cols.qty = i.x;
            if (/Prezzo|Price/i.test(i.str)) cols.price = i.x;
            if (/Sconto|Discount|Sc\./i.test(i.str)) cols.discount = i.x;
            if (/Importo|Amount/i.test(i.str)) cols.total = i.x;
        });

        // The Invoice usually lacks a shipping date column.
        const xQty = cols.qty || 360;
        const xPrice = cols.price || 400;
        const xDiscount = cols.discount || 460;
        const xTotal = cols.total || 520;

        // Snapping boundaries tightly to 15px before the start of the next column
        // This ensures numbers don't bleed rightwards if the header falls back to default.
        const bQtyPrice = xPrice - 15;
        const bPriceDiscount = xDiscount - 15;
        const bDiscountTotal = xTotal - 15;

        let lastLine = null;
        let lastLineY = null;

        for (const page of pages) {
            const items = [...page.items].sort((a, b) => b.y - a.y); // Sort Top to Bottom

            // Find Footers mapping (Supports 'Segue' for multi-page)
            const fLabel = items.find(i => /Totale\s*Merci|Segue|Riporto/i.test(i.str));
            let footerY = fLabel ? fLabel.y : 100;

            // Re-find header if multi page
            let pageHeaderY = 9999;
            const ph = items.find(i => /Articolo|Item/i.test(i.str));
            if (ph) pageHeaderY = ph.y;

            // Group into visual rows
            let curRow = { y: -9999, items: [] };
            const rows = [];
            for (const it of items) {
                if (it.y > pageHeaderY - 5 || it.y < footerY + 2) continue;
                if (Math.abs(it.y - curRow.y) < 5) curRow.items.push(it);
                else {
                    if (curRow.items.length > 0) rows.push(curRow);
                    curRow = { y: it.y, items: [it] };
                }
            }
            if (curRow.items.length > 0) rows.push(curRow);

            let isFirstRowOnPage = true;
            for (const row of rows) {
                row.items.sort((a, b) => a.x - b.x); // Left to Right
                let code = '', desc = '', qty = '', price = '', discount = '', totalStr = '';

                row.items.forEach(i => {
                    const x = i.x;
                    const s = i.str.trim();
                    if (!s) return;

                    if (x < xQty - 15) {
                        if (x < 110) code += s + ' ';
                        else desc += s + ' ';
                    }
                    else if (x < bQtyPrice) qty += s + ' ';
                    else if (x < bPriceDiscount) price += s + ' ';
                    else if (x < bDiscountTotal) discount += s + ' ';
                    else if (x < xTotal + 40) totalStr += s + ' '; // Stop before IVA column
                });

                code = code.trim(); desc = desc.trim(); qty = qty.trim(); price = price.trim(); discount = discount.trim(); totalStr = totalStr.trim();

                const clean = (val) => val.replace(/[^\d,.-]/g, '');

                // --- THE RITMONIO INVOICE SAFETY RULE ---
                // If there's no quantity, no price and no total, IT IS NOT AN ITEM!
                // It is a descriptive block like "Vs. CONFERMA ORD. BS ESTERO" or "DDT N.090680"
                const hasNums = /[\d]/.test(clean(qty)) && /[\d]/.test(clean(price)) && /[\d]/.test(clean(totalStr));
                const combinedRowText = row.items.map(i => i.str).join(' ');

                if (hasNums) {
                    // Valid item block
                    const q = normalizeAmount(clean(qty));
                    const p = normalizeAmount(clean(price));
                    const t = normalizeAmount(clean(totalStr));

                    // DO NOT REDUCE DISCOUNT! Pass it as string so UI shows "45+10"
                    // We only strip weird chars
                    const drStr = discount.replace(/[^\d+.,-]/g, '').trim();

                    const newLine = {
                        code,
                        description: desc,
                        quantity: q,
                        unitPrice: p,
                        total: parseFloat(t.toFixed(2)),
                        discountPercent: drStr
                    };
                    extracted.lines.push(newLine);

                    lastLine = newLine;
                    lastLineY = row.y;
                    isFirstRowOnPage = false;
                } else if (lastLine) {
                    // It's a continuation of the previous item description (IF it's physically close)
                    let extra = (code + ' ' + desc).trim();
                    const isNoise = /Vs\.\s*CONFERMA|DDT|Vs\.\s*ORDINE|CORRISPONDENTE|SHIPPING|VETTORE|CARRIER/i.test(combinedRowText);
                    const isFullWidthText = row.items.some(it => it.x > bQtyPrice - 5);

                    if (extra && !isNoise && !isFullWidthText && Math.abs(row.y - lastLineY) < 30) {
                        lastLine.description += ' ' + extra.replace(/\s{2,}/g, ' ');
                        lastLineY = row.y;
                    }
                }
            }
        }
    }

    // --- 3. Totals (Bulletproof Math Deduction for Invoices) ---
    const sum = extracted.lines.reduce((acc, l) => acc + (l.total || 0), 0);
    extracted.totals.goods = parseFloat(sum.toFixed(2));
    extracted.totals.subtotal = extracted.totals.goods;

    const lastP = (pages && pages.length > 0) ? pages[pages.length - 1].items : [];

    // Find highest value formatted as money in the bottom half of the page
    const bottomItems = lastP.filter(i => i.y < 400 && /[\d]{1,},[\d]{2}/.test(i.str.trim()));
    const bottomVals = bottomItems.map(i => normalizeAmount(i.str));

    const maxVal = bottomVals.length > 0 ? Math.max(...bottomVals) : extracted.totals.goods;

    // The highest money value in the footer is logically the Final Document Total
    extracted.totals.total = maxVal;

    // Transport is the mathematical difference
    const diff = extracted.totals.total - extracted.totals.goods;
    extracted.totals.transport = diff > 0.05 ? parseFloat(diff.toFixed(2)) : 0;
    extracted.totals.discount = 0;
    extracted.totals.tax = 0; // Usually B2B international is tax free, handled in accounting

    // Dynamic Review Toggles
    extracted.confidence = extracted.lines.length > 0 && extracted.totals.total >= extracted.totals.goods ? 0.95 : 0.5;
    extracted.needsReview = extracted.lines.length === 0 || !extracted.totals.total;

    return extracted;
}

module.exports = ritmonioInvoiceExtraction;
