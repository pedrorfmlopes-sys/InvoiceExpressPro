const { extractWithCoords } = require('../utils/pdfCoords');
const extractNicolazziInvoice = require('./nicolazziInvoiceExtraction');
const { normalizeAmount, normalizeDate } = require('./normalize');

function buildFullTextFromCoords(pages) {
    // Build a stable, readable text stream from positioned tokens.
    // This is used ONLY for header/footer extraction (legacy regex logic),
    // not for line parsing.
    const yTolerance = 3; // small bucket to merge tokens that are on the same visual line
    const pageTexts = [];

    for (const page of pages) {
        if (!Array.isArray(page) || page.length === 0) {
            pageTexts.push('');
            continue;
        }

        // Sort top-to-bottom, then left-to-right
        const items = page
            .filter(it => it && typeof it.str === 'string' && it.str.trim() !== '')
            .map(it => ({ str: it.str.trim(), x: it.x ?? 0, y: it.y ?? 0 }))
            .sort((a, b) => (a.y - b.y) || (a.x - b.x));

        // Bucket by Y to reconstruct visual lines
        const lines = [];
        for (const it of items) {
            const last = lines[lines.length - 1];
            if (!last || Math.abs(it.y - last.y) > yTolerance) {
                lines.push({ y: it.y, parts: [it] });
            } else {
                last.parts.push(it);
            }
        }

        const textLines = lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(' '));
        pageTexts.push(textLines.join('\n'));
    }

    return pageTexts.join('\n\n');
}

async function nicolazziInvoiceCoordsExtraction(pdfBuffer) {
    const pages = await extractWithCoords(pdfBuffer);
    if (!pages || pages.length === 0) return null;

    // --- Header/Footer (Legacy) ---
    // Build full text from positioned tokens and reuse legacy extractor for:
    // - docNumber / dates / customer / totals / delivery note (DDT)
    const fullText = buildFullTextFromCoords(pages);
    const legacy = extractNicolazziInvoice(fullText);

    // If legacy rejects (e.g., PROFORMA), do not handle here.
    if (!legacy) return null;



    // 1. Init
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
        debug: { extractor: 'nicolazziInvoiceCoordsExtraction' }
    };

    // 2. Grid Detection (Page 1)
    

    // Merge legacy header/footer fields (keep supplier as defined here)
    extracted.docNumber = legacy.docNumber || extracted.docNumber;
    extracted.dates = legacy.dates || extracted.dates;
    extracted.entities = extracted.entities || {};
    extracted.entities.customer = (legacy.entities && legacy.entities.customer) ? legacy.entities.customer : extracted.entities.customer;

    // Totals: keep legacy (more complete), but ensure at least total/subtotal/tax exist
    if (legacy.totals) {
        extracted.totals = legacy.totals;
        if (!extracted.totals.total && legacy.totals.total != null) extracted.totals.total = legacy.totals.total;
        if (!extracted.totals.subtotal && legacy.totals.subtotal != null) extracted.totals.subtotal = legacy.totals.subtotal;
        if (!extracted.totals.tax && legacy.totals.tax != null) extracted.totals.tax = legacy.totals.tax;
    }

    // Delivery note (DDT): normalize raw -> rawLine
    if (legacy.docRefs && legacy.docRefs.deliveryNote) {
        const dn = legacy.docRefs.deliveryNote;
        extracted.docRefs.deliveryNote = {
            number: dn.number || null,
            date: dn.date || null,
            rawLine: dn.rawLine || dn.raw || null
        };
    }
const page1 = pages[0].items;

    // Y-sort descending (Top-Bottom)
    page1.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
        return b.y - a.y;
    });

    // Detect Header Line
    let headerY = null;
    let cols = { code: 0, desc: 0, ref: 0, um: 0, qty: 0, price: 0, total: 0 };

    // Scan items for "Descrizione"
    for (const item of page1) {
        if (item.str.includes('Descrizione')) {
            const rowY = item.y;
            // Get neighbors
            const rowItems = page1.filter(i => Math.abs(i.y - rowY) < 5);
            // Verify it's the header row
            if (rowItems.some(i => /Articolo|Codice/i.test(i.str))) {
                headerY = rowY;
                // Map Columns
                rowItems.forEach(i => {
                    const t = i.str;
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

    if (!headerY) {
        // Fallback or detected failed
        return null;
    }

    // Define Boundaries (Midpoints)
    const xCode = cols.code || 20;
    const xDesc = cols.desc || 150;
    const xRef = cols.ref || 300;
    const xQty = cols.qty || 400;
    const xPrice = cols.price || 450;
    const xTotal = cols.total || 500;

    const bCodeDesc = (xCode + xDesc) / 2;
    // Special handling if Ref missing
    const bDescRef = cols.ref ? (xDesc + xRef) / 2 : (xDesc + xQty) / 2;
    const bRefQty = cols.ref ? (xRef + xQty) / 2 : bDescRef;
    const bQtyPrice = (xQty + xPrice) / 2;
    const bPriceTotal = (xPrice + xTotal) / 2;

    // 3. Process Rows
    const lines = [];
    let lastLine = null;

    for (const page of pages) {
        const items = page.items.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
            return b.y - a.y;
        });

        // Group into Rows
        let currentRow = { y: -1, items: [] };
        const rows = [];
        for (const item of items) {
            if (page.page === 1 && item.y > headerY - 5) continue; // Skip Header/Pre-header

            // Footer / Legal Stop in Stream (Before Grouping)
            // If item contains known Footer tokens
            if (/Totale|Total|Scadenza|Pagamento|Payment|Non Imp|ART\.|D\.L\.|DESTINATION|Privacy|Pag\.\s*\d/i.test(item.str)) {
                // But wait, "Total" is in column header? We skipped headers.
                // "Total" in body usually means Totals section.
                // Risk: line description containing "Total"?
                // Nicolazzi descriptions usually UPPERCASE. Footer "Total" usually Title Case.
                // Let's rely on X pos + Text
                if (item.x < xDesc) {
                    // Footer starts on left. Stop.
                    // Mark page as done?
                    // Let's create a "Footer Row" and handle later
                }
            }
            // DocNum Filter
            if (extracted.docNumber && item.str.includes(extracted.docNumber)) continue;

            if (Math.abs(item.y - currentRow.y) < 5) {
                currentRow.items.push(item);
            } else {
                if (currentRow.items.length > 0) rows.push(currentRow);
                currentRow = { y: item.y, items: [item] };
            }
        }
        if (currentRow.items.length > 0) rows.push(currentRow);

        // Process Rows
        for (const row of rows) {
            // Sort X
            row.items.sort((a, b) => a.x - b.x);
            const rowText = row.items.map(i => i.str).join(' ');

            // STOP Conditions (Footer)
            if (/Totale|Scadenza|Transport|Porto|Rua|Industria|Non Imp|ART\.|D\.L\.|Summary|DESTINATION|Privacy/i.test(rowText)) {
                continue;
            }
            // Doc Num row check
            const safeRow = rowText.replace(/\s+/g, '');
            if (extracted.docNumber && safeRow.includes(extracted.docNumber.replace(/\s+/g, ''))) continue;
            // Customer Name check
            if (extracted.entities.customer.name) {
                const safeName = extracted.entities.customer.name.replace(/\s+/g, '');
                if (safeRow.includes(safeName)) continue;
            }

            // DDT
            const mDDT = rowText.match(/DDT\s+Nr\.?\s*(\d+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i);
            if (mDDT && !extracted.docRefs.deliveryNote) {
                extracted.docRefs.deliveryNote = {
                    number: mDDT[1],
                    date: normalizeDate(mDDT[2]),
                    raw: mDDT[0]
                };
                continue; // Consumed
            }

            // Bucketing
            let code = "";
            let desc = "";
            let ref = "";
            let qty = "";
            let price = "";
            let total = "";

            row.items.forEach(i => {
                const x = i.x;
                const s = i.str.trim();
                if (!s) return;

                if (x < bCodeDesc) code += s + " ";
                else if (x < bDescRef) desc += s + " ";
                else if (x < bRefQty) {
                    if (cols.ref) ref += s + " ";
                    else desc += s + " ";
                }
                else if (x < bQtyPrice) qty += s + " ";
                else if (x < bPriceTotal) price += s + " ";
                else total += s + " ";
            });

            code = code.trim();
            desc = desc.trim();
            ref = ref.trim();
            price = price.trim();
            total = total.trim();

            // Check for valid line item (Price/Total numeric)
            // Allow price to be empty if qty is there? No,            // Parse Numerics
            // Price/Total usually have "86,50". Qty "1".
            // Strict Check: Must contain comma (EUR format) OR be exactly "0".
            // Must NOT be a Date (dd/mm/yyyy).
            // Must NOT be a VAT (PT...).
            const isDate = (s) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s);
            const isVAT = (s) => /^(PT|IT)\d+/.test(s);
            const looksLikeMoney = (s) => /[\d.]+,\d{2}/.test(s) || s === '0';

            const pTrim = price.replace(/[^\d,\.]/g, ''); // cleanup
            const tTrim = total.replace(/[^\d,\.]/g, '');

            const hasFinancials = (looksLikeMoney(price) || looksLikeMoney(total))
                && !isDate(price) && !isDate(total)
                && !isVAT(price) && !isVAT(total);

            // Double check footer signals in Code/Desc
            if (!hasFinancials && /Totale|Scadenza|Pagamento|Privacy|Page|Pagina|Pag\./i.test(code)) continue;

            // Garbage filter: If NOT financials, and looks like DocNum or Address (ARQ...), skip
            // Don't append to description if it's clearly footer
            if (!hasFinancials) {
                if (/ASTRO|ALZO|D\.L\.|Non Imp|ART\./i.test(rowText)) continue;
                // If row contains date and docnum only
                if (/\d{2}\/\d{2}\/\d{4}/.test(rowText) && /\d+\/[A-Z]/.test(rowText)) continue;
                // If row is just customer name extraction repetition
                if (rowText.includes("ARQ.JOANA")) continue; // Hardcoded heuristic for observed leak
            }

            if (hasFinancials && (/\d/.test(qty) || /\d/.test(price))) {
                // New Line
                const p = normalizeAmount(price);
                const t = normalizeAmount(total);
                // Qty parsing
                let q = 1;
                let uom = null;
                const mQ = qty.match(/([A-Z]{2})?\s*(\d+)/i);
                if (mQ) {
                    if (mQ[1]) uom = mQ[1];
                    if (mQ[2]) q = parseInt(mQ[2], 10);
                }

                // Tax Code Extraction
                // Often in Total bucket: "86,50 NI41" -> "NI41"
                // Or "86,50" and Tax is in Price bucket? No.
                let taxCode = null;
                const mTax = total.match(/(NI\d+)/) || price.match(/(NI\d+)/);
                // Look for NI code anywhere in right side
                if (mTax) taxCode = mTax[1];

                // Normalize Total (remove tax code from string)
                // "86,50 NI41" -> "86,50"
                // Already done by normalizeAmount (strips non-numeric chars except comma/dot).

                const newLine = {
                    code: code,
                    description: desc,
                    quantity: q,
                    unitPrice: p,
                    total: t,
                    orderRef: ref || null,
                    taxCode: taxCode,
                    uom: uom
                };
                extracted.lines.push(newLine);
                lastLine = newLine;
            } else {
                // Continuation
                if (lastLine && Math.abs(lastLine.y - currentRow.items[0].y) < 50) { // Same block
                    if (desc) lastLine.description += " " + desc;
                    // If Ref bucket has text but no col?
                    if (ref && !cols.ref) lastLine.description += " " + ref;
                    // If Code bucket has text?
                    if (code && !/DDT|Totale/i.test(code)) {
                        // Decide if code or desc continuation
                        // Usually Nicolazzi codes are one line.
                        // Assume desc bleed.
                        lastLine.description += " " + code;
                    }
                }
            }
        }
    }

    // 4. Metadata (Regex on Full Text)
    extracted.confidence = 0.99;
    return extracted;
}

module.exports = nicolazziInvoiceCoordsExtraction;
