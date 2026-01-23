const { normalizeAmount, normalizeDate } = require('./normalize');

function extractButo(text) {
    const extracted = {
        docNumber: null,
        dates: { issued: null, due: null },
        totals: {
            goods: null,
            transport: null,
            packaging: null,
            discount: null, // Unified (Main + Extra)
            subtotal: null,
            tax: null,
            total: null,
            discountMain: null, // Keep raw breakdown
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
        return m ? normalizeAmount(m[1]) : null;
    }

    // "Total Bruto" => goods
    extracted.totals.goods = getVal(/Total Bruto\s+([\d\.]+,\d{2})/);

    let discMain = getVal(/Total Descuento\s+(-?[\d\.]+,\d{2})/);
    let discExtra = getVal(/Dto\. Adicional[^\n]*\s+(-?[\d\.]+,\d{2})/);

    extracted.totals.discountMain = discMain;
    extracted.totals.discountExtra = discExtra;

    const absDiscMain = discMain ? Math.abs(discMain) : 0;
    const absDiscExtra = discExtra ? Math.abs(discExtra) : 0;
    if (absDiscMain || absDiscExtra) {
        extracted.totals.discount = absDiscMain + absDiscExtra;
    }

    let base = getVal(/Base imponible\s+([\d\.]+,\d{2})/);
    let grand = getVal(/Total \(€\)\s+([\d\.]+,\d{2})/);

    if (base) extracted.totals.subtotal = base;
    if (grand) extracted.totals.total = grand;

    if (!extracted.totals.tax) {
        if (!grand && base) extracted.totals.total = base;
        if (!base && grand) extracted.totals.subtotal = grand;
        if (text.includes('exempt from VAT') || extracted.totals.subtotal === extracted.totals.total) {
            extracted.totals.tax = 0;
        }
    }

    // --- E) Lines (Table) ---
    // Extract only between Header and "Resumen"
    // Header pattern: DESCRIPCIÓN ... TOTAL (fuzzy match not robust, check substrings)
    // Find Header Index
    const lines = text.split('\n');
    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('DESCRIPCIÓN') && lines[i].includes('TOTAL') && lines[i].includes('DTO.%')) {
            startIdx = i + 1;
            break;
        }
    }

    // Find Resumen
    for (let i = startIdx; i < lines.length; i++) {
        if (lines[i].includes('Resumen')) {
            endIdx = i;
            break;
        }
    }

    if (startIdx === -1) startIdx = 0; // Fallback

    let currentLine = null;

    for (let i = startIdx; i < endIdx; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Pattern Check: CODE ... VALUES
        // Values: [INC] [PVP] [DTO%] [TOTAL]
        // Example: "GA053 ... 30 2.236,00 40% 1.341,60"

        // Strategy: Match all EU money values (XXX,XX or X.XXX,XX)
        const moneys = [...line.matchAll(/([\d\.]+,\d{2})/g)];

        if (moneys.length >= 2) {
            // New Line detected
            if (currentLine) validateAndPush(extracted.lines, currentLine);

            // LAST money is Total
            const totalStr = moneys[moneys.length - 1][0];
            const lineTotal = normalizeAmount(totalStr);

            // FIRST money is UnitPrice (PVP)
            // But wait, DTO and INC are integers, not money usually (no comma decimals unless percent?)
            // "30" for INC, "40%" for DTO. 
            // PVP is "2.236,00".
            // So UnitPrice is the FIRST money match.
            const pvpStr = moneys[0][0];
            const unitPrice = normalizeAmount(pvpStr);

            // Find Code: First token
            const codeMatch = line.match(/^([A-Z0-9]{2,6})\s+/);
            const code = codeMatch ? codeMatch[1] : null;

            // Finish Code: Token after code
            let finishCode = null;
            if (code) {
                const remainder = line.substring(code.length).trim();
                // Heuristic: finish code often has chars/digits/dashes
                const token = remainder.split(' ')[0];
                if (token && token.length > 3 && /\d/.test(token)) {
                    finishCode = token;
                }
            }

            // Extract numeric fields (UD, INC, DTO)
            // They appear between code/finish and PVP, or between PVP and Total.
            // Layout: [UD?] [INC?] PVP [DTO%] TOTAL
            // UD defaults to 1. INC defaults to 0. DTO defaults to 0.

            // DTO%: often has %, check regex
            let discountPercent = 0;
            const dtoMatch = line.match(/(\d{1,2})\s*%/);
            if (dtoMatch) discountPercent = parseFloat(dtoMatch[1]);

            // Qty (UD) and INC (Integer)
            // Look at text segment BEFORE PVP match index
            const pvpIdx = line.indexOf(pvpStr);
            const prePvp = line.substring(0, pvpIdx); // Contains Code, Finish, UD, INC

            // Remove code/finish from prePvp
            let cleanPre = prePvp;
            if (code) cleanPre = cleanPre.replace(code, '');
            if (finishCode) cleanPre = cleanPre.replace(finishCode, '');

            // Find integers in remainder
            const intMatches = [...cleanPre.matchAll(/\b(\d+)\b/g)].map(m => parseInt(m[1], 10));
            // Should filter out likely FinishCode parts if they leaked (e.g. S1M111)
            // Regex \b\d+\b should avoid "S1M111".

            let quantity = 1;
            let incrementPercent = 0;

            // Logic: 
            // If 2 integers detected: First is UD, Second is INC?
            // Or only INC present? (User said: "UD é a quantidade (por omissão 1 se ausente)")
            // "parser atual está a meter o '30' como quantity" -> so 30 is INC.
            // If only 1 int found: Is it UD or INC?
            // BUTO header says: "UD. | PRECIO | TOTAL | DTO.% | INC." or similar order?
            // User: "UD pode aparecer antes do INC ... [INC] [PVP]"
            // "GA053 ... 30 2.236,00" -> 30 is INC (Increment 30%).
            // Usually Quantity 1 is omitted.
            // HEURISTIC: If value > 10, assume INC? (Risky if Qty=20).
            // Better: Look for header alignment? No positional data in text mode.
            // User says "parser atual está a meter o '30' como quantity".
            // Let's assume: If 1 integer => INC if > 5? Or check header columns?
            // Header: DESCRIPCIÓN | DETALLE | ACABADO | UD. | COD. | PRECIO | TOTAL | DTO.% | INC. | SUBTOTAL
            // Wait, "INC." column exists.

            // If we have "30" before PVP.
            // If we have "2   30" before PVP -> UD=2, INC=30.
            // Let's take last integer before PVP as INC? 
            // If there's another before that, it's Qty.

            if (intMatches.length >= 2) {
                incrementPercent = intMatches[intMatches.length - 1]; // Closest to Price
                quantity = intMatches[intMatches.length - 2];
            } else if (intMatches.length === 1) {
                // Ambiguous. 30 is likely INC. 2 is likely Qty.  
                // BUTO increments are often 20, 30, 40 %.
                // Quantities are usually 1, 2, 3.
                const val = intMatches[0];
                if (val >= 10) {
                    incrementPercent = val;
                } else {
                    quantity = val;
                }
            }

            // Description extraction
            // User says: "Description is the trailing text after lineTotal (trim)"
            // Let's verify this again.
            // "GA053 OLDG-F3... 30 2.236 ... 1.341,60 Mueble ..."
            // Yes, "Mueble ..." appears AFTER "1.341,60" (Total).
            // So everything AFTER total is Description.
            const totalIdx = line.indexOf(totalStr);
            const postTotal = line.substring(totalIdx + totalStr.length).trim();

            let description = postTotal;
            if (!description && finishCode) {
                // Maybe description is between Code and Numbers?
                // Fallback
                description = cleanPre.trim();
            }

            currentLine = {
                code,
                finishCode,
                description,
                quantity,
                unitPrice,
                incrementPercent,
                discountPercent,
                total: lineTotal,
                finishText: null
            };

        } else if (currentLine) {
            // Continuation line (finishText or desc)
            // "Madera ..."
            if (line.startsWith('Madera') || line.startsWith('Acabado') || line.startsWith('Material')) {
                currentLine.finishText = (currentLine.finishText ? currentLine.finishText + ' ' : '') + line;
            } else {
                // If text is legal text? Check against "Resumen" (already stopped loop).
                // "Inscrita en el Registro..."
                if (line.includes('Inscrita') || line.includes('Registro Merkantil')) {
                    // Ignore legal footers
                } else {
                    currentLine.description += ' ' + line;
                }
            }
        }
    }

    if (currentLine) validateAndPush(extracted.lines, currentLine);

    return extracted;
}

function validateAndPush(linesArr, line) {
    // 4) Validation per line
    // expectedTotal = UD * PVP * (1 + INC/100) * (1 - DTO/100)
    const { quantity, unitPrice, incrementPercent, discountPercent, total } = line;
    const incMult = 1 + (incrementPercent || 0) / 100;
    const dtoMult = 1 - (discountPercent || 0) / 100;

    const expected = quantity * unitPrice * incMult * dtoMult;

    const diff = Math.abs(expected - total);

    if (diff > 0.1) { // 0.05 tolerance looser due to rounding steps
        line.needsReview = true;
        line.validationIssue = `lineTotalMismatch (Exp: ${expected.toFixed(2)}, Found: ${total})`;
    }

    linesArr.push(line);
}

module.exports = extractButo;
