function extractAxaHeaders(lines) {
    let supplierName = 'AXA / COLAVENE';
    let supplierAddress = [];
    let supplierVatCode = '';

    let customerName = '';
    let customerAddress = [];
    let customerCode = '';
    let customerNif = '';

    let shippingName = '';
    let shippingAddress = [];

    let destX = -1;
    let custX = -1;

    // Find boundaries
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (line.includes('Destinazione:')) destX = line.indexOf('Destinazione:');
        if (line.includes('Destinatario:')) custX = line.indexOf('Destinatario:');
        if (destX !== -1 && custX !== -1) break;
    }

    // Default layout splits roughly based on AXA structures
    if (destX === -1) destX = 85;
    if (custX === -1) custX = 145;

    for (let i = 0; i < Math.min(25, lines.length); i++) {
        let line = lines[i];
        if (!line || line.trim() === '') continue;

        // Stop going down when we hit the table definitions or lower bounds
        if (line.includes('Codice cliente') || line.includes('Partita IVA') || line.includes('Descrizione della merce')) {
            break;
        }

        const padLine = line.padEnd(250, ' ');

        const c1 = padLine.substring(0, destX - 5).trim();
        const c2 = padLine.substring(destX - 5, custX - 5).trim();
        const c3 = padLine.substring(custX - 5).trim();

        // Col 1 (Supplier)
        if (c1) {
            if (c1.match(/S\.r\.l\.|S\.p\.A\.|COLAVENE|AXA|Ceramica/i)) {
                if (supplierName === 'AXA / COLAVENE') supplierName = c1;
            } else if (c1.match(/sede operativa:|Via |sede legale:/i)) {
                supplierAddress.push(c1);
            } else if (c1.includes('C.F / P.Iva')) {
                const m = c1.match(/C\.F \/ P\.Iva:\s*([A-Z0-9]+)/i);
                if (m) supplierVatCode = m[1];
            }
        }

        // Col 2 (Shipping)
        if (c2 && !c2.startsWith('Destinazione:') && !c2.match(/^A-\d{5}/)) {
            if (!shippingName) {
                shippingName = c2;
            } else {
                shippingAddress.push(c2);
            }
        }

        // Col 3 (Customer)
        if (c3 && !c3.startsWith('Destinatario:')) {
            let processedC3 = c3.replace(/Fattura|Ordine|Proforma|Pro-forma/i, '').trim();
            if (processedC3.match(/^A-\d{5}/)) {
                customerCode = processedC3.split(' ')[0];
                processedC3 = processedC3.replace(customerCode, '').trim();
            }

            if (processedC3) {
                if (!customerName) {
                    customerName = processedC3;
                } else {
                    customerAddress.push(processedC3);
                }
            }
        }
    }

    // Separate loop for NIF to be safe since it might be below the first boundary
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i];
        if (line.includes('Partita IVA o codice fiscale') || line.includes('Partita IVA')) {
            const nextL = lines[i + 1] || '';
            const matchNif = nextL.match(/(PT|IT|ES|FR|DE)\s+([0-9A-Z]+)/);
            if (matchNif) {
                customerNif = matchNif[1] + matchNif[2];
                break;
            }
        }
    }

    return {
        supplier: {
            name: supplierName,
            address: supplierAddress.join(', '),
            vat_number: supplierVatCode
        },
        shipping: {
            name: shippingName || customerName,
            address: shippingAddress.join(', ')
        },
        customer: {
            name: customerName,
            nif: customerNif,
            code: customerCode,
            address: customerAddress.join(', ')
        }
    };
}

module.exports = { extractAxaHeaders };
