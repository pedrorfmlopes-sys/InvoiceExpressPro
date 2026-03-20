const { normalizeAmount, normalizeDate } = require('./normalize');

function normalizeAmountButo(raw) {
    if (!raw) return 0;
    let clean = raw.trim().replace(/\s/g, '');
    if (/^\d{1,3}(?:\.\d{3})+$/.test(clean) && !clean.includes(',')) {
        clean = clean.replace(/\./g, '') + ',00';
    }
    return normalizeAmount(clean);
}

function extractButo(text) {
    const extracted = {
        docNumber: null, dates: { issued: null, due: null },
        totals: { goods: 0, transport: 0, packaging: 0, discount: 0, subtotal: 0, tax: 0, total: 0 },
        lines: [],
        entities: {
            customer: { name: null, vat: null, address: null },
            supplier: { name: "BUTO DESIGN S.L.", vat: "B02883957", address: "Alicante, Spain" }
        },
        debug: { butoProfileVersion: "BUTO_INVOICE_V12_POPPLER_LAYOUT" }
    };

    const refRegex = /INT\/\d{2}-\d{6}/g;
    const allRefs = text.match(refRegex) || [];
    if (allRefs.length > 0) extracted.docNumber = allRefs[0];

    const issuedMatch = text.match(/FACTURA\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (issuedMatch) extracted.dates.issued = normalizeDate(issuedMatch[1]);

    const clienteMatch = text.match(/CLIENTE\s*\n\s*([^\n]+)/);
    if (clienteMatch) extracted.entities.customer.name = clienteMatch[1].trim();

    const lines = text.split('\n');
    let tableStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('UD.') && lines[i].includes('COD.') && lines[i].includes('TOTAL')) {
            tableStart = i + 1; break;
        }
    }

    if (tableStart !== -1) {
        for (let i = tableStart; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim() || line.includes('Total Bruto') || line.includes('Resumen')) break;

            // Poppler Layout Positions (approximate based on header)
            // UD.  COD.      DESCRIPCIÓN                      DETALLE       ACABADO       PRECIO  %INC      TOTAL  DTO.%   SUBTOTAL
            const udPart = line.substring(0, 5).trim();
            if (!udPart || isNaN(parseInt(udPart))) {
                if (extracted.lines.length > 0 && line.substring(10, 45).trim()) {
                    extracted.lines[extracted.lines.length - 1].description += " " + line.substring(10, 45).trim();
                }
                continue;
            }

            const codePart = line.substring(5, 15).trim();
            const descPart = line.substring(15, 45).trim();
            const detailPart = line.substring(45, 60).trim();
            const finishPart = line.substring(60, 75).trim();
            const pricePart = line.substring(75, 85).trim();
            const incPart = line.substring(85, 95).trim();
            const totalPart = line.substring(95, 105).trim();
            const dtoPart = line.substring(105, 115).trim();
            const subtotalPart = line.substring(115).trim();

            if (codePart) {
                extracted.lines.push({
                    quantity: parseInt(udPart, 10),
                    code: codePart,
                    description: descPart,
                    detailCode: detailPart || null,
                    finishCode: finishPart || null,
                    basePrice: normalizeAmountButo(pricePart),
                    incrementPercent: parseInt(incPart, 10) || 0,
                    totalBeforeDto: normalizeAmountButo(totalPart),
                    discountPercent: parseFloat(dtoPart.replace('%', '')) || 0,
                    total: normalizeAmountButo(subtotalPart)
                });
            }
        }
    }

    const getVal = (re) => {
        const m = text.match(re);
        return m ? normalizeAmountButo(m[1]) : 0;
    }
    extracted.totals.goods = getVal(/Total Bruto\s*[:\.]?\s*([\d\.]+,\d{2})/i);
    extracted.totals.subtotal = getVal(/Base imponible\s+([\d\.]+,\d{2})/i);
    extracted.totals.total = getVal(/Total \(€\)\s+([\d\.]+,\d{2})/i);

    return extracted;
}

module.exports = extractButo;
