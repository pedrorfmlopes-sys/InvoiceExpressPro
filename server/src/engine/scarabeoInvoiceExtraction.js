const { pdfBufferToTextPoppler } = require('../utils/popplerText');

const safeConvertNumber = (str) => {
    if (!str) return 0;
    // Handle "1.260,00" -> 1260.00
    const cleanStr = str.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanStr) || 0;
};

/**
 * Extractor for SCARABEO Covering Invoice
 * Uses Poppler -layout for visual fixed-offset columns.
 */
function extractFromText(text) {
    let extracted = {
        docType: 'fatura',
        metadata: {},
        entities: { supplier: { name: 'SCARABEO CERAMICHE S.R.L.' }, customer: {} },
        lines: [],
        totals: {},
        docParams: {}
    };

    const lines = text.split(/\r?\n/);

    // 1. Metadata (Regex is fine for headers)
    const headerBlock = text.substring(0, 3000);
    let docDateMatch = headerBlock.match(/(?:Document Date|Data Documento)[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
    if (docDateMatch) extracted.date = docDateMatch[1];

    let docNumMatch = headerBlock.match(/(?:Document Number|Doc\. Number|Numero Doc\.)[\s\S]*?(\d{2}\/\d{2}\/\d{4})[^\n\d]*?([A-Z0-9\/]+)/i);
    if (docNumMatch) {
        extracted.date = extracted.date || docNumMatch[1];
        extracted.docNumber = docNumMatch[2];
        extracted.metadata.doc_number = docNumMatch[2];
        extracted.metadata.doc_date = extracted.date;
    }

    // 1.5 Shipping Marks / Ref (Ord. n. / Ref. est. / Crd. n.)
    const ordMatch = text.match(/Ord\.\s*n\.?\s*([^\s\n]+)/i) ||
        text.match(/Ref\.\s*est\.\s*([^\s\n]+)/i) ||
        text.match(/Crd\.\s*n\.?\s*([^\s\n]+)/i);
    if (ordMatch) {
        extracted.shippingMarks = ordMatch[1].trim();
        extracted.metadata.client_ref = extracted.shippingMarks;
    }

    // 2. Customer Table (Column-Aware via substring)
    // Find "Invoicing to:" column
    let invoicingRow = -1;
    let invoicingCol = -1;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const idx = lines[i].indexOf('Invoicing to:');
        if (idx !== -1) {
            invoicingRow = i;
            invoicingCol = idx;
            break;
        }
    }

    if (invoicingRow !== -1) {
        const customerArr = [];
        // Scan 10 lines below in that specific column
        for (let i = invoicingRow + 1; i < invoicingRow + 12; i++) {
            if (!lines[i]) continue;
            // Take substring from invoicingCol to end, but trim it to avoid picking up columns to the right
            const sub = lines[i].substring(invoicingCol).trim();
            if (!sub) continue;

            // Stop if we hit footer-ish or header-ish labels in that column
            if (sub.match(/^(Document Date|Doc\. Number|VAT Code|Total|Discounts|Transport|Packaging|HS CODE|PT|IT|Doc\.|PROJETO|SHP MARKS|----------------|Ord\.)/i)) break;

            // Scarabeo sometimes has Page info in that column
            if (sub.match(/^Page\s+\d+/i)) continue;

            customerArr.push(sub.split(/\s{3,}/)[0]); // Take only the left part of the box if there's noise to the right
        }

        if (customerArr.length > 0) {
            // First line that isn't just a number (like customer code)
            let nameIdx = 0;
            while (nameIdx < customerArr.length && customerArr[nameIdx].match(/^\d+$/)) {
                nameIdx++;
            }
            if (nameIdx < customerArr.length) {
                extracted.customer = customerArr[nameIdx];
                extracted.entities.customer.name = customerArr[nameIdx];
                extracted.entities.customer.address = customerArr.slice(nameIdx + 1).join(', ');
            }
        }
    }

    // 3. NIF
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

                // Look 2 lines below in the same column
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

    // 1.6 Project Reference
    const projectMatch = text.match(/(?:EXPO\s*ORDER|PROJECT:?\s*[^\n]+|PRESUPUESTO\s*DD\.\s*\d{2}\/\d{2}\/\d{4})/i);
    if (projectMatch) {
        extracted.metadata.project_ref = projectMatch[0].trim();
        extracted.projectRef = extracted.metadata.project_ref; 
    }

    // [New] Free-text fallback
    if (!extracted.projectRef) {
        const lineHeaderIdx = lines.findIndex(l => 
            l.includes('Good or Service Code') || 
            l.includes('Description of Good') ||
            l.includes('Codice merce o servizio') ||
            l.includes('Descrizione merce o servizio')
        );
        if (lineHeaderIdx !== -1) {
            // 1. BELOW (Collect potential project info before the first SKU) - Primary for Scarabeo
            let candidates = [];
            for (let i = lineHeaderIdx + 1; i < lineHeaderIdx + 10; i++) {
                const candidate = lines[i]?.trim();
                if (!candidate) continue;
                // Stop if we hit a SKU line (has a code and a U.M. marker)
                if (candidate.match(/^([A-Z0-9a-z-]{3,20})\s+.*(NR|KG|PCS|GR|MT|LT|NR\.|PARA|FORNI|BOX)\s+.*[\d,\.]+/)) break;
                
                // Exclude header labels
                if (candidate.match(/^(Good|Description|U\.M\.|Quantity|Price|Amount|Segue|Continued|Codice|Descrizione|Quantità|Prezzo|Sconti|Importo)/i)) continue;
                
                if (candidate.length > 5 && !candidate.match(/^[0-9\s,\.]+$/)) {
                    candidates.push(candidate);
                }
            }
            if (candidates.length > 0) {
                // Prioritize ENCOMENDA/ORDEM then others
                const important = candidates.find(c => c.match(/^(ENCOMENDA|ORDEM|PEDIDO|MOCK\s*UP)/i)) || 
                                  candidates.find(c => c.match(/^(REF|PROJ|PROJECT|Ord\.\s*n)/i));
                let finalRef = (important || candidates.join(' / ')).trim();
                // Clean trailing VAT codes (e.g. " ... 40")
                finalRef = finalRef.replace(/\s+\d{2}$/, '');
                extracted.projectRef = finalRef;
                extracted.metadata.project_ref = extracted.projectRef;
            }

            // 2. Fallback to lines ABOVE
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

    // Safety fallback
    const n = parseFloat(extracted.totals.net);
    const t = parseFloat(extracted.totals.transport);
    const p = parseFloat(extracted.totals.packaging);
    let g = parseFloat(extracted.totals.gross || 0);

    // [FIX] If gross was high but we suspect it already includes N+T+P, we prioritize the extracted 'Document total Euro'
    if (g > 0 && n > 0 && Math.abs(g - (n + t + p)) > 1) {
        if (Math.abs(n - g) < 1) {
            // Net was caught as Gross. 
        } else if (Math.abs(g - (n + t + p)) < 1) {
             // Matching perfectly.
        }
    }

    if (g === 0) {
        g = n + t + p;
        extracted.totals.gross = g.toFixed(2);
    }
    extracted.total = extracted.totals.gross;

    // 5. Lines
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        // More flexible regex: SKU, then description, then some units (optional), then quantities and prices.
        // We look for patterns like: SKU DESC... UNIT QTY PRICE TOTAL
        const lineRegex = /^([A-Z0-9a-z-]{3,20})\s+(.+?)\s+(?:(NR|PZ|Pz|Nr|Mt|Kg|Lt)\s+)?([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)(?:\s+[\d,\.]+)?$/;
        const match = line.match(lineRegex);
        if (match) {
            let desc = match[2].trim();
            let j = i + 1;
            while (j < lines.length) {
                let nextLine = lines[j].trim();
                if (!nextLine || nextLine.match(/^([A-Z0-9a-z-]{3,15})\s+/)) break;
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

async function processInvoice(pdfBuffer) {
    const text = pdfBufferToTextPoppler(pdfBuffer);
    return extractFromText(text);
}

module.exports = {
    extractFromText,
    processInvoice
};
