const { pdfBufferToTextPoppler } = require('../utils/popplerText');

async function processProforma(pdfBuffer) {
    let rawText = '';
    try {
        rawText = pdfBufferToTextPoppler(pdfBuffer);
    } catch (e) {
        console.error("[AxaProformaExtractor] Poppler failed", e);
        throw new Error("Falha ao extrair formato do documento via Poppler.");
    }

    const lines = rawText.split(/\r?\n/);
    let parsedLines = [];
    let state = 'SEARCHING_START';

    // Global Metadata
    let docNumber = '';
    let docDate = '';
    let customerName = '';
    let customerAddress = [];
    let shippingName = '';
    let shippingAddress = [];
    let customerNif = '';
    let packagingTotal = 0; // Spese di incasso (Emb 3%)
    let shippingTotal = 0;  // Spese di trasporto (Portes)
    let extractedNetTotal = 0; // Totale (Subtotal)
    let extractedGrossTotal = 0; // Totale documento EU (Final Total)

    // New references
    let ddtRefs = [];
    let extractedShippingMarks = '';

    const stopKeywords = [
        "Totale",
        "Sconti/maggiorazioni",
        "Spese di trasporto",
        "Spese di incasso",
        "Timbro e firma",
        "Tipo pagamento"
    ];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Headers extraction
        // In Proforma usually:
        // Data documento:                                             Numero doc.:
        //                      13-01-2026                                                     4/PA
        if (line.includes('Data documento:')) {
            const nextL = lines[i + 1] || '';
            const nextL2 = lines[i + 2] || '';
            const m = nextL.match(/(\d{2}-\d{2}-\d{4})\s+([\d\/A-Z]+)/) || nextL2.match(/(\d{2}-\d{2}-\d{4})\s+([\d\/A-Z]+)/);
            if (m) {
                docDate = m[1];
                docNumber = m[2];
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

        // 1. Spese di incasso OR Spese di imballo (Emb 3%) -> mapped to packagingTotal
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
                    if (val > 0 && packagingTotal === 0) packagingTotal = val; // Only set if not already captured by incasso
                    break;
                }
            }
        }
        // 2. Spese di trasporto (Portes) -> mapped to shippingTotal
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
        // 3. Totale (Subtotal)
        if (line.includes('Totale') && !line.includes('Totale documento')) {
            let x = line.indexOf('Totale');
            for (let j = 1; j <= 2; j++) {
                const nextL = lines[i + j] || '';
                const sub = nextL.substring(Math.max(0, x - 5), x + 20).trim().split(/\s{2,}/)[0];
                if (sub && sub.match(/^[\d\.,]+$/)) {
                    extractedNetTotal = parseFloat(sub.replace(/\./g, '').replace(',', '.'));
                    break;
                }
            }
        }
        // 4. Totale documento EU (Gross Total)
        if (line.includes('Totale documento EU')) {
            let parts = line.split(/[A-Z]{2}/);
            let valPart = parts[parts.length - 1].trim();
            if (valPart.match(/^[\d\.,]+$/)) {
                extractedGrossTotal = parseFloat(valPart.replace(/\./g, '').replace(',', '.'));
            } else {
                // look next line
                const nextL = lines[i + 1] || '';
                if (nextL.match(/^[\d\.,]+$/)) {
                    extractedGrossTotal = parseFloat(nextL.trim().replace(/\./g, '').replace(',', '.'));
                }
            }
        }

        // Table Detection
        if (state === 'SEARCHING_START') {
            if (line.includes('Descrizione della merce') && line.includes('Quantità')) {
                state = 'IN_TABLE';
                continue;
            }
        } else if (state === 'IN_TABLE') {
            let cleanLine = line.trim();
            if (!cleanLine) continue;

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

            const cols = cleanLine.split(/\s{2,}/);

            // A typical valid item line:
            // "9301001", "+TRENTANOVE W.HUNG...", "PZ", "2,000", "335,00000 -55,00 -10,00", "271,35", "NI41"
            if (cols.length >= 5) {
                let sku = cols[0];
                let desc = cols[1];
                let um = '';

                let pzIndex = cols.findIndex(c => c === 'PZ' || c === 'CP' || c === 'NR');

                let qtyRaw = "0";
                let discountRaw = "0";
                let totalRaw = "0";
                let unitPriceRaw = "0";

                if (pzIndex !== -1 && pzIndex < cols.length - 1) {
                    um = cols[pzIndex];
                    const remainingCols = cols.slice(pzIndex + 1); // [Qty, Price+Disc, Total, VAT]

                    if (remainingCols.length >= 3) {
                        qtyRaw = remainingCols[0];

                        let priceDiscountStr = remainingCols[1];
                        const pdMatch = priceDiscountStr.match(/([\d\.,]+)\s*(-\d+[\.,]\d+(?:\s*-\d+[\.,]\d+)?)/);
                        if (pdMatch) {
                            unitPriceRaw = pdMatch[1];
                            discountRaw = pdMatch[2].replace(/-/g, '').replace(/\s+/g, '+'); // Evaluatable later if needed, e.g. "55,00+10,00"
                        } else {
                            unitPriceRaw = priceDiscountStr;
                        }

                        totalRaw = remainingCols[remainingCols.length - 2];
                    }
                } else {
                    continue;
                }

                let qty = parseFloat(qtyRaw.replace(/\./g, '').replace(',', '.'));
                let unitPrice = parseFloat(unitPriceRaw.replace(/\./g, '').replace(',', '.'));
                let total = parseFloat(totalRaw.replace(/\./g, '').replace(',', '.'));
                // Use just the first discount value for simplicity or the string
                let pureDiscount = discountRaw.split('+')[0];

                if (sku && desc && !isNaN(qty) && qty > 0) {
                    parsedLines.push({
                        code: sku.trim(),
                        description: desc.trim(),
                        quantity: qty,
                        unitPrice: unitPrice || 0,
                        discountPercent: pureDiscount ? pureDiscount.replace(',', '.') : '0',
                        total: total || 0,
                        uom: um,
                        projectRef: '',
                        extra_attributes: { original_unit: um }
                    });
                }
            }
        }
    }

    let normDate = null;
    let fallbackDate = null;
    if (docDate) {
        const dMatch = docDate.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (dMatch) {
            normDate = `${dMatch[3]}-${dMatch[2]}-${dMatch[1]}`;
            fallbackDate = `${dMatch[1]}/${dMatch[2]}/${dMatch[3]}`;
        }
    }

    const netTotal = extractedNetTotal || parsedLines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
    const grossTotal = extractedGrossTotal || (netTotal + packagingTotal + shippingTotal);

    return {
        docType: "proforma",
        docNumber: docNumber || "C.PEDIDO",
        date: fallbackDate,
        dates: {
            issued: normDate
        },
        docRefs: ddtRefs,
        shippingMarks: extractedShippingMarks,
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

module.exports = { processProforma };
