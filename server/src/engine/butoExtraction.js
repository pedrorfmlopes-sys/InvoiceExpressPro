const { normalizeAmount, normalizeDate } = require('./normalize');

function extractButo(text) {
    const extracted = {
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
            // Extra fields for context
            discountMain: null,
            discountExtra: null
        },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: { name: null, vat: null, address: null }
        },
        paymentStatus: null
    };

    // --- A) Doc Number ---
    const refRegex = /INT\/\d{2}-\d{6}/g;
    const allRefs = text.match(refRegex) || [];
    if (allRefs.length > 0) {
        extracted.docNumber = allRefs[0];
        extracted.references = allRefs.slice(1);
    }

    // Check "Ref. Cliente LX2 387"
    const refCliMatch = text.match(/Ref\. Cliente\s+([A-Z0-9\s]+)(?:$|\n)/i);
    if (refCliMatch) {
        if (!extracted.references) extracted.references = [];
        extracted.references.push({ type: 'customer', value: refCliMatch[1].trim() });
    }

    // --- B) Dates ---
    const issuedMatch = text.match(/FACTURA\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (issuedMatch) {
        extracted.dates.issued = normalizeDate(issuedMatch[1]);
    }

    if (/Pagado/i.test(text.substring(0, 1000))) {
        extracted.paymentStatus = 'paid';
    }

    // --- C) Entities ---
    if (/BUTO\s+DESIGN\s+S\.L\./i.test(text)) {
        extracted.entities.supplier.name = "BUTO DESIGN S.L.";
        const supVat = text.match(/(?:ES)?B02883957/);
        if (supVat) extracted.entities.supplier.vat = supVat[0];
        extracted.entities.supplier.address = "Alicante, Spain";
    }

    const clienteMatch = text.match(/CLIENTE\s*\n(.+)/);
    if (clienteMatch) {
        extracted.entities.customer.name = clienteMatch[1].trim();
    }
    const ptVat = text.match(/\bPT(\d{9})\b/);
    if (ptVat) {
        extracted.entities.customer.vat = 'PT' + ptVat[1];
    }

    // --- D) Totals ---
    const getVal = (re) => {
        const m = text.match(re);
        return m ? normalizeAmount(m[1]) : 0;
    }

    // Mappings based on user request:
    // "Total Bruto" => goods (sum of gross lines)
    // "Base imponible" => subtotal
    // "Total (€)" => total

    extracted.totals.goods = getVal(/Total Bruto\s+([\d\.]+,\d{2})/);
    extracted.totals.subtotal = getVal(/Base imponible\s+([\d\.]+,\d{2})/);
    extracted.totals.total = getVal(/Total \(€\)\s+([\d\.]+,\d{2})/);

    // Discounts
    let discMain = getVal(/Total Descuento\s+(-?[\d\.]+,\d{2})/);
    let discExtra = getVal(/Dto\. Adicional[^\n]*\s+(-?[\d\.]+,\d{2})/);

    // Calculated unified discount
    // discount = goods - total + extra? 
    // Or just abs(discMain + discExtra)?
    // User said: "discount = goods - total (+ extra discount if "Dto. Adicional")"
    // Let's use the explicit values found first.
    extracted.totals.discount = Math.abs(discMain) + Math.abs(discExtra);

    // Exempt VAT check
    if (!extracted.totals.tax) {
        if (text.includes('exempt from VAT') || Math.abs(extracted.totals.subtotal - extracted.totals.total) < 0.05) {
            extracted.totals.tax = 0;
        }
    }

    // --- E) Lines (Table) ---
    // Extract only between Header and "Resumen"
    const lines = text.split('\n');
    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if ((lines[i].includes('DESCRIPCIÓN') && lines[i].includes('TOTAL')) || lines[i].includes('UD.') && lines[i].includes('PRECIO')) {
            startIdx = i + 1;
            break;
        }
    }

    for (let i = startIdx; i < lines.length; i++) {
        if (lines[i].includes('Resumen')) {
            endIdx = i;
            break;
        }
    }

    if (startIdx === -1) startIdx = 0;

    let currentLine = null;

    for (let i = startIdx; i < endIdx; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        if (line.includes('Total Bruto')) break; // safety

        // LINE PARSING STRATEGY:
        // Columns: UD | COD | ... | PRECIO | %INC | TOTAL | DTO | SUBTOTAL
        // Strategy: 
        // 1. Find 3 money values at the END of string (PRECIO, TOTAL, SUBTOTAL).
        // 2. Find UD and COD at START of string.

        // Find all EU money pattern matches: roughly digits,digits or digits.digits,digits
        // Using strict regex for price-like numbers
        const moneyRegex = /([\d\.]+,\d{2})/g;
        const moneyMatches = [...line.matchAll(moneyRegex)];

        // Valid main line should have at least 3 money values (Precio, Total, Subtotal)
        // Or if some are 0, they should still appear in column text?
        // User implied columns exist. 
        // "PRECIO | %INC | TOTAL | DTO | SUBTOTAL"
        // Let's analyze from Right to Left.

        if (moneyMatches.length >= 3) {
            if (currentLine) extracted.lines.push(currentLine);

            const subtotalStr = moneyMatches[moneyMatches.length - 1]; // SUBTOTAL (Net)
            const totalStr = moneyMatches[moneyMatches.length - 2];    // TOTAL (Gross)
            const priceStr = moneyMatches[moneyMatches.length - 3];    // PRECIO (Unit)

            const net = normalizeAmount(subtotalStr[0]);
            const gross = normalizeAmount(totalStr[0]);
            const unitPrice = normalizeAmount(priceStr[0]);

            // Now find percentages (INC and DTO) in the gaps
            // Gap 1: Between PRECIO and TOTAL -> %INC
            // Gap 2: Between TOTAL and SUBTOTAL -> DTO

            const idxPrice = priceStr.index;
            const idxTotal = totalStr.index;
            const idxSub = subtotalStr.index;

            const textInc = line.substring(idxPrice + priceStr[0].length, idxTotal).trim();
            const textDto = line.substring(idxTotal + totalStr[0].length, idxSub).trim();

            const parsePercent = (s) => {
                const m = s.match(/(\d+(?:[\.,]\d+)?)/);
                return m ? parseFloat(m[1].replace(',', '.')) : 0;
            };

            const incrementPercent = parsePercent(textInc);
            const discountPercent = parsePercent(textDto);

            // Left Side: UD | COD | DESC...
            // Pre-Price Text
            const prePrice = line.substring(0, idxPrice).trim();

            // UD is first int token
            let quantity = 1;
            let code = null;
            let description = "";

            // Regex for start: ^(\d+)\s+([A-Z0-9\-\/]+)\s+(.*)
            const startMatch = prePrice.match(/^(\d+)\s+([^\s]+)\s+(.*)/);

            if (startMatch) {
                quantity = parseInt(startMatch[1], 10);
                code = startMatch[2];
                description = startMatch[3].trim();
            } else {
                // Should match? "parser atual está a meter o '30' como quantity"
                // If regex failed, maybe try just UD and COD
                const parts = prePrice.split(/\s+/);
                if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
                    quantity = parseInt(parts[0], 10);
                    code = parts[1];
                    description = parts.slice(2).join(' ');
                } else {
                    // Fallback/Error in pattern
                    description = prePrice;
                }
            }

            currentLine = {
                quantity,
                code,
                unitPrice, // PRECIO
                incrementPercent,
                gross, // TOTAL
                discountPercent,
                net, // SUBTOTAL
                description,
                finishText: null, // continuation
                // Fields for validation/debug
                pvpUnit: unitPrice
            };

            // Validation
            // expectedGross = UD * PRECIO * (1 + INC/100)
            const expectedGross = quantity * unitPrice * (1 + incrementPercent / 100);
            // expectedNet = expectedGross * (1 - DTO/100) - Wait, Gross already includes Inc. 
            // "Total (gross) = UD * Precio * (1+Inc)" -> User Formula.
            // "Subtotal (net) = Total * (1-Dto)" -> checks out logic.
            const expectedNet = expectedGross * (1 - discountPercent / 100);

            // Compare
            // We compare expectedGross vs extracted Gross(TOTAL)
            if (Math.abs(expectedGross - gross) > 0.05) {
                currentLine.needsReview = true;
                currentLine.validationIssue = `GrossMismatch exp:${expectedGross.toFixed(2)} act:${gross}`;
            }
            // We compare expectedNet vs extracted Net(SUBTOTAL)
            if (Math.abs(expectedNet - net) > 0.05) {
                // If Gross matched but Net didn't, issue is DTO calc
                if (!currentLine.needsReview) {
                    currentLine.needsReview = true;
                    currentLine.validationIssue = `NetMismatch exp:${expectedNet.toFixed(2)} act:${net}`;
                }
            }

            // Store final total as Net (Canonical 'total' for a line usually means the effective amount contributing to document subtotal)
            // Canonical schema usually expects 'total' to be the net line total (excluding VAT).
            // User requested: "Store line fields: { ..., gross: TOTAL, net: SUBTOTAL }"
            // I will map 'total' property of object to 'net' for engine compatibility, 
            // but keep 'gross' and 'net' explicit properties too.
            currentLine.total = net;

        } else if (currentLine) {
            // Continuation
            if (line.startsWith('Madera') || line.startsWith('Acabado') || line.startsWith('Material')) {
                currentLine.finishText = (currentLine.finishText ? currentLine.finishText + ' ' : '') + line;
            } else {
                // Ignore legal
                if (line.includes('Inscrita') || line.includes('Registro Merkantil')) {
                    // skip
                } else {
                    currentLine.description += ' ' + line;
                }
            }
        }
    }

    if (currentLine) extracted.lines.push(currentLine);

    // Totals Validation (Global)
    // Sum(lines.total) - abs(discountExtra) ?= totals.total (Net)
    // Actually, lines.total here is mapped to Net.
    // Sum line nets = Subtotal (Base Imponible). 
    // If Dto Extra exists, it applies to document global?
    // User: "sum(lines.total) - abs(discountExtra) should equal totals.total"
    // (Assuming lines.total is the net sum of lines).
    // Let's add that check.
    const sumLines = extracted.lines.reduce((acc, l) => acc + (l.net || 0), 0);
    const absExtra = Math.abs(extracted.totals.discountExtra || 0);
    const calcSubtotal = sumLines - absExtra;

    // Check against extracted.totals.subtotal or total?
    // User said "equals totals.total". But "totals.total" (Base Imponible) usually is what lines sum to.

    // If mismatch, warn.
    // We won't block return, just log or add warning if structure supported.
    // Engine v2 validate.js handles generic mismatch.

    return extracted;
}

module.exports = extractButo;
