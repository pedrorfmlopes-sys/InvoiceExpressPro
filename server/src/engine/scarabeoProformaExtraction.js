const { pdfBufferToTextPoppler } = require('../utils/popplerText');

const safeConvertNumber = (str) => {
    if (!str) return 0;
    const cleanStr = str.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanStr) || 0;
};

/**
 * Extractor for SCARABEO Pro-Forma
 * Uses Poppler -layout for visual fixed-offset columns.
 */
function extractFromText(text) {
    let extracted = {
        docType: 'scarabeo_proforma',
        metadata: {},
        entities: { supplier: { name: 'SCARABEO CERAMICHE S.R.L.' }, customer: {} },
        lines: [],
        totals: {},
        docParams: {}
    };

    const lines = text.split(/\r?\n/);

    const headerBlock = text.substring(0, 3000);
    let docDateMatch = headerBlock.match(/(?:Document Date|Data Documento)[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
    if (docDateMatch) extracted.date = docDateMatch[1];

    let docNumMatch = headerBlock.match(/(?:Pro-Forma n\.|n\.|Proforma n\.)[\s\S]*?(\d{2,6}\/?FP?)/i);
    if (docNumMatch) {
        extracted.docNumber = docNumMatch[1];
        extracted.metadata.doc_number = docNumMatch[1];
        extracted.metadata.doc_date = extracted.date;
    }

    // 1.5 Shipping Marks / Ref
    const ordMatch = text.match(/Ord\.\s*n\.?\s*([^\s\n]+)/i) ||
        text.match(/Ref\.\s*est\.\s*([^\s\n]+)/i) ||
        text.match(/Crd\.\s*n\.?\s*([^\s\n]+)/i);
    if (ordMatch) {
        extracted.shippingMarks = ordMatch[1].trim();
        extracted.metadata.client_ref = extracted.shippingMarks;
    }

    // [New] Free-text just above lines header as Project Ref fallback
    if (!extracted.projectRef) {
        const lineHeaderIdx = lines.findIndex(l => 
            l.includes('Good or Service Code') || 
            l.includes('Description of Good') ||
            l.includes('Codice merce o serviço') ||
            l.includes('Descrizione merce o serviço')
        );
        if (lineHeaderIdx !== -1) {
            // 1. Check lines BELOW (Primary for Scarabeo table-based refs)
            let candidates = [];
            for (let i = lineHeaderIdx + 1; i < lineHeaderIdx + 10; i++) {
                const candidate = lines[i]?.trim();
                if (!candidate) continue;
                const isSkuLine = candidate.match(/^([A-Z0-9a-z-]{3,20})\s+.*(NR|KG|PCS|GR|MT|LT|NR\.|PARA|FORNI|BOX)\s+.*[\d,\.]+/);
                if (isSkuLine) break;
                
                if (candidate.match(/^(Good|Description|U\.M\.|Quantity|Price|Amount|Segue|Continued|Codice|Descrizione|Quantità|Prezzo|Sconti|Importo)/i)) continue;

                if (candidate.length > 5 && !candidate.match(/^[0-9\s,\.]+$/)) {
                    candidates.push(candidate);
                }
            }
            if (candidates.length > 0) {
                const important = candidates.find(c => c.match(/^(ENCOMENDA|ORDEM|PEDIDO|MOCK\s*UP)/i)) || 
                                  candidates.find(c => c.match(/^(REF|PROJ|PROJECT|Ord\.\s*n)/i));
                let finalRef = (important || candidates.join(' / ')).trim();
                // Clean trailing VAT codes (e.g. " ... 40")
                finalRef = finalRef.replace(/\s+\d{2}$/, '');
                extracted.projectRef = finalRef;
                extracted.metadata.project_ref = extracted.projectRef;
            }

            // 2. Fallback to lines ABOVE (Only if nothing found below)
            if (!extracted.projectRef) {
                for (let i = lineHeaderIdx - 1; i > Math.max(0, lineHeaderIdx - 6); i--) {
                    const candidate = lines[i]?.trim();
                    if (candidate && !candidate.match(/^(Good|Document|Page|REA|Cap\.|REA|Codice|REA|REA|IBAN|SWIFT|BIC|Our Bank|Intesa|Cod\.|Pag\.|TRANSFER|Payment|PAGAMENTO)/i) && candidate.length > 5 && !candidate.match(/\d{2}\/\d{2}\/\d{4}/) && !candidate.match(/^[0-9\s,\.]+$/) && !candidate.includes('IT ') && !candidate.includes('ABI:') && !candidate.includes('CARCAVELOS')) {
                        extracted.projectRef = candidate;
                        extracted.metadata.project_ref = candidate;
                        break;
                    }
                }
            }
        }
    }

    // Default Ship Marks for Proforma (Numeric part of Doc Number)
    if (!extracted.shippingMarks && extracted.docNumber) {
        const numPart = extracted.docNumber.split('/')[0].replace(/\D/g, '');
        if (numPart) {
            extracted.shippingMarks = numPart;
            extracted.metadata.client_ref = numPart;
        }
    }

    // Ensure docRefs has something for the UI
    if (extracted.docNumber) {
        extracted.docRefs = [extracted.docNumber];
        extracted.metadata.ddt_ref = extracted.docNumber;
    }

    // 2. Customer & Shipping ROI-Based Extraction
    // We target two main blocks: "Messrs" (Consignee/Billing) and "Delivery Address" (Shipping)

    const findBlock = (anchors, maxLines = 60) => {
        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
            for (const anchor of anchors) {
                const idx = lines[i].indexOf(anchor);
                if (idx !== -1) return { row: i, col: idx };
            }
        }
        return null;
    };

    // A. Consignee / Billing (Messrs / Spett.le / Consignee)
    const consigneeBlock = findBlock(['Messrs:', 'Spett.le', 'Customer:', 'Cliente:', 'Invoicing to:', 'Consignee:']);
    if (consigneeBlock) {
        const arr = [];
        for (let i = consigneeBlock.row + 1; i < consigneeBlock.row + 12; i++) {
            if (!lines[i]) continue;
            // Target the column to the right
            const sub = lines[i].substring(consigneeBlock.col).trim();
            if (!sub) continue;
            if (sub.match(/^(Document Date|Doc\. Number|VAT Code|Total|Discounts|Transport|Packaging|HS CODE|PT|IT|Doc\.|PROJETO|SHP MARKS|----------------|Ord\.|Ref\.|Crd\.|Net|Gross|IBAN|SWIFT|Pag\.)/i)) break;
            const clean = sub.split(/\s{3,}/)[0];
            if (clean) arr.push(clean);
        }
        if (arr.length > 0) {
            let nameIdx = 0;
            while (nameIdx < arr.length && (arr[nameIdx].match(/^\d+$/) || arr[nameIdx].length < 3)) nameIdx++;
            if (nameIdx < arr.length) {
                extracted.entities.customer.name = arr[nameIdx];
                extracted.entities.customer.address = arr.slice(nameIdx + 1).join(', ');
                extracted.customer = arr[nameIdx];
            }
        }
    }

    // B. Delivery Address (Shipping)
    const deliveryBlock = findBlock(['Delivery Address', 'Delivery to:', 'Destinatario:', 'Destino:']);
    if (deliveryBlock) {
        const arr = [];
        for (let i = deliveryBlock.row + 1; i < deliveryBlock.row + 12; i++) {
            if (!lines[i]) continue;
            // Special ROI: only take the text between deliveryCol and consigneeCol (if exists)
            let endIdx = lines[i].length;
            if (consigneeBlock && consigneeBlock.col > deliveryBlock.col) {
                endIdx = consigneeBlock.col;
            }
            const sub = lines[i].substring(deliveryBlock.col, endIdx).trim();
            if (!sub) continue;
            if (sub.match(/^(Document Date|Doc\. Number|VAT Code|Total|Discounts|Transport|Packaging|HS CODE|PT|IT|Doc\.|PROJETO|SHP MARKS|----------------|Ord\.|Ref\.|Crd\.|Net|Gross|IBAN|SWIFT|Pag\.)/i)) break;
            const clean = sub.split(/\s{3,}/)[0];
            if (clean) arr.push(clean);
        }
        if (arr.length > 0) {
            extracted.entities.shipping = extracted.entities.shipping || {};
            extracted.entities.shipping.address = arr.join(', ');
            // If customer name is still empty, try to get it from delivery if it looks like a name
            if (!extracted.entities.customer.name && arr[0].length > 5) {
                extracted.entities.customer.name = arr[0];
                extracted.customer = arr[0];
            }
        }
    }

    const ptVatMatch = text.match(/Co\.Vat Reg\.N\. or Fiscal Code[\s\S]{0,100}?\b(PT)?\s*(5\d{8})\b/i);
    if (ptVatMatch) extracted.entities.customer.vat = 'PT' + ptVatMatch[2];

    // 4. Totals (Column-Aware Persistent Scanning)
    const getVal = (label) => {
        let lastVal = 0;
        const regex = new RegExp(label, 'i');
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(regex);
            if (m) {
                const labelX = m.index;
                const labelRow = i;
                for (let j = 1; j <= 2; j++) {
                    const candidateLine = lines[labelRow + j];
                    if (!candidateLine) continue;
                    const sub = candidateLine.substring(Math.max(0, labelX - 10), labelX + 40).trim().split(/\s{2,}/)[0];
                    if (sub && sub.match(/^[\d\.,]+$/)) {
                        lastVal = safeConvertNumber(sub);
                        break;
                    }
                }
            }
        }
        return lastVal;
    };

    extracted.totals.net = parseFloat(getVal('\\bTotal\\b') || 0).toFixed(2);
    extracted.totals.transport = parseFloat(getVal('Transport Expenses') || 0).toFixed(2);
    extracted.totals.packaging = parseFloat(getVal('Packaging Expenses') || 0).toFixed(2);

    // Document Total Euro ... (Value to the right)
    const dtMatch = text.match(/Document Total Euro[\s\.]*([\d\.,]+)/i) ||
        text.match(/Total Due[\s\.]*([\d\.,]+)/i) ||
        text.match(/Total Amount[\s\.]*([\d\.,]+)/i);
    if (dtMatch) {
        extracted.totals.gross = parseFloat(safeConvertNumber(dtMatch[1])).toFixed(2);
    }

    const n = parseFloat(extracted.totals.net);
    const t = parseFloat(extracted.totals.transport);
    const p = parseFloat(extracted.totals.packaging);
    let g = parseFloat(extracted.totals.gross || 0);

    // [FIX] If gross was high but we suspect it already includes N+T+P, we prioritize the extracted 'Document total Euro'
    // Scarabeo layout: Net (Total) + Shipment + Packaging = Document Total Euro.
    if (g > 0 && n > 0 && Math.abs(g - (n + t + p)) > 1) {
        // If (n + t + p) equals gross, we are good.
        // If not, maybe 'n' was caught incorrectly (e.g. caught Document Total as Net).
        if (Math.abs(n - g) < 1) {
            // Net was caught as Gross. Try to re-identify Net from 1 line above or below if possible, 
            // but for now let's just ensure we don't ADD p/t to g again.
        } else if (Math.abs(g - (n + t + p)) < 1) {
             // Matching perfectly.
        }
    }

    if (g === 0) {
        g = n + t + p;
        extracted.totals.gross = g.toFixed(2);
    }
    extracted.total = extracted.totals.gross;

    const linesArr = text.split('\n');
    for (let i = 0; i < linesArr.length; i++) {
        let line = linesArr[i].trim();
        if (!line) continue;
        // More flexible regex: SKU, then description, then some units (optional), then quantities and prices.
        const lineRegex = /^([A-Z0-9a-z-]{3,20})\s+(.+?)\s+(?:(NR|PZ|Pz|Nr|Mt|Kg|Lt)\s+)?([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)(?:\s+[\d,\.]+)?$/;
        const match = line.match(lineRegex);
        if (match) {
            let desc = match[2].trim();
            let j = i + 1;
            while (j < linesArr.length) {
                let nextLine = linesArr[j].trim();
                if (!nextLine || nextLine.match(/^([A-Z0-9a-z-]{3,15})\s+/) || nextLine.match(/^Edif\./i)) break;
                if (nextLine.match(/Pag\.|Page|of|Good or Service|Description|U\.M\.|Quantity|Price|Amount|Segue|Continued/i)) { j++; continue; }
                if (nextLine.match(/Document total|Total|Trasporto|Payment|IBAN|BIC|SWIFT|Art\.\d+/i)) break;
                desc += ' ' + nextLine;
                j++;
            }
            i = j - 1;
            extracted.lines.push({
                sku: match[1],
                description: desc.replace(/\s+/g, ' ').trim(),
                quantity: safeConvertNumber(match[4]),
                unitPrice: safeConvertNumber(match[5]),
                total: safeConvertNumber(match[6])
            });
        }
    }

    extracted.dates = { issued: extracted.date };
    return extracted;
}

async function processProforma(pdfBuffer) {
    const text = pdfBufferToTextPoppler(pdfBuffer);
    return extractFromText(text);
}

module.exports = {
    extractFromText,
    processProforma
};
