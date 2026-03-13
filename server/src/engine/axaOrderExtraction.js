const { pdfBufferToTextPoppler } = require('../utils/popplerText');

async function processOrderConfirmation(pdfBuffer) {
    let rawText = '';
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        console.error("[AxaOrderExtractor] Poppler failed", e);
        throw new Error("Falha ao extrair formato do documento via Poppler.");
    }

    const lines = rawText.split(/\r?\n/);

    let parsedLines = [];
    let state = 'SEARCHING_START';

    // Global Metadata
    let orderNumber = '';
    let docDate = '';
    let customerName = '';
    let customerAddress = [];
    let shippingName = '';
    let shippingAddress = [];
    let customerNif = '';
    let customerRef = '';
    let packagingTotal = 0;
    let shippingTotal = 0;

    // New references
    let ddtRefs = [];
    let extractedShippingMarks = '';

    const stopKeywords = [
        "Spedizione per conto di",
        "Totale",
        "Sconti/maggiorazioni",
        "***LA NOSTRA AZIENDA",
        "Timbro e firma",
        "Spese di imballo"
    ];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Headers extraction (basic layout sniffing)
        if (line.includes('Numero documento')) {
            const nextL = lines[i + 1] || '';
            const nextL2 = lines[i + 2] || '';
            const matchDateDoc = nextL.match(/(\d{2}-\d{2}-\d{4})\s+([\d\/A-Z]+)/) || nextL2.match(/(\d{2}-\d{2}-\d{4})\s+([\d\/A-Z]+)/);
            if (matchDateDoc) {
                docDate = matchDateDoc[1];
                orderNumber = matchDateDoc[2].split('/')[0]; // Store only "543" instead of "543/OA"
            }
        }

        // Entities: Destinazione (Shipping, Green) and Destinatario (Customer, Violet)
        if (!customerName && (line.includes('Destinazione:') || line.includes('Destinatario:'))) {
            let destX = line.indexOf('Destinazione:');
            let custX = line.indexOf('Destinatario:');
            if (custX === -1) custX = line.length;

            for (let j = 1; j <= 12; j++) {
                const nextLine = lines[i + j] || '';
                if (nextLine.includes('Descrizione della merce') || nextLine.includes('Code & Product description') || nextLine.includes('Codice della merce')) break;
                if (!nextLine.trim()) continue;

                if (destX !== -1) {
                    let partShip = nextLine.substring(destX, Math.max(custX - 5, destX)).trim();
                    if (partShip && !shippingName && !partShip.match(/^A-\d/) && !partShip.includes('Destinazione')) {
                        shippingName = partShip;
                    } else if (partShip && shippingName && !partShip.match(/^(Codice|Porto|Agente|Condizioni|Trasportatore|Pagamento|Data|Numero|Valuta|Sconti|IBAN\s|IT\d)/i)) {
                        shippingAddress.push(partShip);
                    }
                }

                if (custX !== -1 && custX !== line.length) {
                    let partCust = nextLine.substring(custX, Math.max(custX + 50, nextLine.length)).trim();
                    if (partCust && !customerName && !partCust.match(/^A-\d/) && !partCust.includes('Fattura') && !partCust.includes('Ordine') && !partCust.includes('Proforma')) {
                        customerName = partCust.split(/\s{2,}/)[0];
                    } else if (partCust && customerName && !partCust.match(/^A-\d/) && !partCust.match(/^(Pag\.|Sconto|Numero|Data|IBAN\s|IT\d)/i)) {
                        customerAddress.push(partCust.split(/\s{2,}/)[0].replace(/Pag\..*/, '').trim());
                    }
                }
            }
        }

        // Customer NIF (Red)
        if (line.includes('Partita IVA o codice fiscale') || line.includes('Partita IVA')) {
            const nextL = lines[i + 1] || '';
            const matchNif = nextL.match(/(PT|IT|ES|FR|DE)\s+([0-9A-Z]+)/);
            if (matchNif) {
                customerNif = matchNif[1] + matchNif[2];
            }
        }

        // Customer Reference (Rif. Cliente)
        if (line.includes('Rif. Cliente')) {
            const matchRef = line.match(/Rif\.\s*Cliente\s+(.+)$/);
            if (matchRef && matchRef[1].trim() && matchRef[1].trim() !== '0') {
                customerRef = matchRef[1].trim();
            } else {
                // If it's just "Rif. Cliente 0" check up to 4 lines down
                for (let k = 1; k <= 4; k++) {
                    const nextL = lines[i + k] || '';
                    if (nextL.includes('AOC')) {
                        const parts = nextL.trim().split(/\s{2,}/);
                        const possibleRef = parts.find(p => p.includes('AOC'));
                        if (possibleRef) {
                            customerRef = possibleRef.trim();
                            break;
                        }
                    } else if (nextL.match(/\s{10,}[A-Z0-9\/_-]+$/)) {
                        const parts = nextL.trim().split(/\s{2,}/);
                        const possibleRef = parts[parts.length - 1];
                        if (possibleRef && !possibleRef.includes('Trasportatore') && !possibleRef.includes('Agente')) {
                            customerRef = possibleRef.trim();
                            break;
                        }
                    }
                }
            }
        }
        // Fallback for Customer Reference (Ref. est.:) in the table area
        if (!customerRef && line.includes('Ref. est.:')) {
            const matchRefExt = line.match(/Ref\.\s*est\.:\s*(.+)$/);
            if (matchRefExt && matchRefExt[1].trim()) {
                customerRef = matchRefExt[1].trim();
            }
        }

        // Totals: Packaging (Emb 3%) -> Spese di incasso or Spese di imballo
        if (line.includes('Spese di incasso')) {
            let x = line.indexOf('Spese di incasso');
            for (let j = 1; j <= 2; j++) {
                const nextL = lines[i + j] || '';
                const sub = nextL.substring(Math.max(0, x - 5), x + 30).trim().split(/\s{2,}/)[0];
                if (sub && sub.match(/^[\d\.,]+$/)) {
                    let val = parseFloat(sub.replace(/\./g, '').replace(',', '.'));
                    if (val > 0) packagingTotal = val;
                    break;
                }
            }
        }
        if (line.includes('Spese di imballo')) {
            let x = line.indexOf('Spese di imballo');
            for (let j = 1; j <= 2; j++) {
                const nextL = lines[i + j] || '';
                const sub = nextL.substring(Math.max(0, x - 5), x + 30).trim().split(/\s{2,}/)[0];
                if (sub && sub.match(/^[\d\.,]+$/)) {
                    let val = parseFloat(sub.replace(/\./g, '').replace(',', '.'));
                    if (val > 0 && packagingTotal === 0) packagingTotal = val;
                    break;
                }
            }
        }

        // Shipping (Portes)
        if (line.includes('Spese di trasporto')) {
            let x = line.indexOf('Spese di trasporto');
            for (let j = 1; j <= 2; j++) {
                const nextL = lines[i + j] || '';
                const sub = nextL.substring(Math.max(0, x - 5), x + 30).trim().split(/\s{2,}/)[0];
                if (sub && sub.match(/^[\d\.,]+$/)) {
                    shippingTotal = parseFloat(sub.replace(/\./g, '').replace(',', '.'));
                    break;
                }
            }
        }

        // Start Table Detection
        if (state === 'SEARCHING_START') {
            if (line.includes('Codice della merce') && line.includes('Descrizione della merce')) {
                state = 'IN_TABLE';
                // Wait for the underline or skip a couple of lines, typically 1 or 2 lines below is the real data
                continue;
            }
        } else if (state === 'IN_TABLE') {
            let cleanLine = line.trim();
            if (!cleanLine) continue;

            // Stop condition
            if (stopKeywords.some(kw => cleanLine.includes(kw))) {
                state = 'DONE';
                continue;
            }

            // Extract references before skipping them
            if (cleanLine.startsWith('Ord. n.')) {
                let m = cleanLine.match(/^Ord\. n\.\s+([^\s]+)\s+del/);
                if (m) ddtRefs.push(m[1]);
            }
            if (cleanLine.startsWith('Ref. est.')) {
                let m = cleanLine.match(/^Ref\. est\.?:?\s+(.*)/);
                if (m) extractedShippingMarks = m[1].trim();
            }

            // Exclude noise
            if (cleanLine.match(/^Rif\. \(DT\)/) || cleanLine.match(/^Ord\. n\./) || cleanLine.match(/^Ref\. est\./) || cleanLine.match(/^Spedizione n\./) || cleanLine === '.') continue;

            // A valid table line usually has multiple columns separated by 2+ spaces.
            // Example: "8050012      KRACKLITE SEMI ...      PZ       1,000    818,00000 -45,00            449,90  NI41    13-02-2026"
            // Let's use regex to split by 2 or more spaces
            const cols = cleanLine.split(/\s{2,}/);

            // Typically an item line has at least 5-6 columns: [SKU, Desc, UM, Qty, Price, Total, Date]
            // Sometimes discount is glued or there are multiple elements.
            if (cols.length >= 6) {
                // Determine layout indices:
                // Typically:
                // 0: SKU (e.g. 8050012)
                // 1: Desc (e.g. KRACKLITE SEMI...)
                // 2: UM (PZ)
                // 3: Qty (1,000 - sometimes glued with price? With poppler -layout it usually separates it)

                // Let's try to map dynamically from right to left because right side is more stable structurally
                // Last col (-1): Date (Data ev./rich. e.g. 13-02-2026) -> but might be missing if no date.
                // 2nd Last (-2): VAT Code (NI41)
                // 3rd Last (-3): Total (449,90) - might have discount before it

                let sku = cols[0];
                let desc = cols[1];
                let um = '';

                // Let's search for 'PZ' as the UM marker
                let pzIndex = cols.findIndex(c => c === 'PZ' || c === 'CP' || c === 'NR');

                let qtyRaw = "0";
                let discountRaw = "0";
                let totalRaw = "0";
                let dateRaw = "";
                let unitPriceRaw = "0";

                if (pzIndex !== -1 && pzIndex < cols.length - 1) {
                    um = cols[pzIndex];

                    // After PZ follows: Qty, Price, Discount, Total, VAT, Date
                    // Due to column alignment, Qty and Price might be in their own col or merged.
                    // E.g.: "1,000", "818,00000 -45,00", "449,90", "NI41", "13-02-2026"
                    const remainingCols = cols.slice(pzIndex + 1);

                    if (remainingCols.length >= 4) {
                        qtyRaw = remainingCols[0]; // e.g., "1,000"

                        // Parse Price and Discount
                        let priceDiscountStr = remainingCols[1]; // e.g. "818,00000 -45,00"
                        const pdMatch = priceDiscountStr.match(/([\d\.,]+)\s*(-\d+[\.,]\d+)?/);
                        if (pdMatch) {
                            unitPriceRaw = pdMatch[1];
                            discountRaw = pdMatch[2] ? pdMatch[2].replace('-', '') : '0';
                        } else {
                            unitPriceRaw = priceDiscountStr;
                        }

                        // Last columns usually: Total, VAT, Date
                        let lastCol = remainingCols[remainingCols.length - 1];
                        if (lastCol.match(/\d{2}-\d{2}-\d{4}/)) {
                            dateRaw = lastCol;
                            totalRaw = remainingCols[remainingCols.length - 3] || '0';
                        } else {
                            totalRaw = remainingCols[remainingCols.length - 2] || remainingCols[remainingCols.length - 1]; // Fallback
                        }
                    }
                } else {
                    // Fallback if PZ not found correctly as a separate col
                    continue;
                }

                // Clean numbers
                let qty = parseFloat(qtyRaw.replace(/\./g, '').replace(',', '.'));
                let unitPrice = parseFloat(unitPriceRaw.replace(/\./g, '').replace(',', '.'));
                let total = parseFloat(totalRaw.replace(/\./g, '').replace(',', '.'));

                // Normalize dates: From DD-MM-YYYY to YYYY-MM-DD
                let normDate = null;
                const dMatch = dateRaw.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (dMatch) {
                    normDate = `${dMatch[3]}-${dMatch[2]}-${dMatch[1]}`;
                }

                if (sku && desc && !isNaN(qty) && qty > 0) {
                    parsedLines.push({
                        code: sku.trim(),
                        description: desc.trim(),
                        quantity: qty,
                        unitPrice: unitPrice || 0,
                        discountPercent: discountRaw ? discountRaw.replace(',', '.') : '0',
                        total: total || 0,
                        uom: um,
                        projectRef: '',
                        extra_attributes: {
                            original_unit: um,
                            original_date: dateRaw,
                            predicted_ship_date: normDate
                        }
                    });
                }
            } else if (cols.length === 1 && cleanLine.match(/^Ref\. est\./)) {
                // Secondary Header lines like Ref. est.: 207/PA
                continue;
            }
        }
    }

    const netTotal = parsedLines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
    const grossTotal = netTotal + packagingTotal + shippingTotal;

    let normDate = null;
    let fallbackDate = null;
    if (docDate) {
        const dMatch = docDate.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (dMatch) {
            normDate = `${dMatch[3]}-${dMatch[2]}-${dMatch[1]}`;
            fallbackDate = `${dMatch[1]}/${dMatch[2]}/${dMatch[3]}`;
        }
    }

    return {
        docType: 'c_pedido',
        docNumber: orderNumber,
        date: docDate,
        dates: {
            issued: docDate ? docDate.split('-').reverse().join('-') : null
        },
        docRefs: customerRef ? [customerRef, ...ddtRefs].filter(Boolean) : ddtRefs,
        shippingMarks: extractedShippingMarks || customerRef,
        metadata: {
            customerRef: customerRef
        },
        entities: {
            supplier: { name: "AXA s.r.l." },
            customer: { name: customerName || "AXA Customer", nif: customerNif, address: customerAddress.join(', ') },
            shipping: { name: shippingName, address: shippingAddress.join(', ') }
        },
        totals: {
            net: parseFloat(netTotal).toFixed(2),
            packaging: packagingTotal,
            transport: shippingTotal,
            vat: 0,
            gross: parseFloat(grossTotal).toFixed(2),
            total: parseFloat(grossTotal).toFixed(2)
        },
        lines: parsedLines
    };
}

module.exports = { processOrderConfirmation };
