const fs = require('fs');
const path = require('path');

// MOCK: mimic client/src/components/viewers/nicolazziUtils.js
const normalizeNicolazziData = (rawData) => {
    if (!rawData) return { lines: [], totals: {}, entities: { customer: {}, supplier: {}, shipTo: {} } };

    const data = { ...rawData };

    // 1. Normalize Lines
    data.lines = (Array.isArray(data.lines) ? data.lines : []).map(l => ({
        ...l,
        // Map extractor's discountText to viewer's discountPercent
        discountPercent: l.discountPercent || l.discountText || ''
    }));

    // 2. Normalize Entities
    data.entities = data.entities || {};
    data.entities.customer = data.entities.customer || {};
    data.entities.supplier = data.entities.supplier || {};

    // shipTo Fallback
    if (!data.entities.shipTo || (!data.entities.shipTo.name && !data.entities.shipTo.address)) {
        data.entities.shipTo = {
            name: data.entities.customer.name || '',
            address: data.entities.customer.deliveryAddress || data.entities.customer.address || ''
        };
    }

    // 3. Normalize Totals
    data.totals = data.totals || {};
    data.totals.net = String(data.totals.net || data.totals.goods || '0.00');
    data.totals.vat = String(data.totals.vat || data.totals.tax || '0.00');
    data.totals.transport = String(data.totals.transport || '0.00');
    data.totals.gross = String(data.totals.gross || data.totals.total || '0.00');

    // 4. Normalize References
    let ref = '';
    if (Array.isArray(data.docRefs) && data.docRefs.length > 0) {
        ref = data.docRefs[0];
    } else if (data.docRefs && typeof data.docRefs === 'object') {
        ref = data.docRefs.customerRef || '';
    } else if (data.customerRef) {
        ref = data.customerRef;
    }

    data.customerRef = ref;
    data.docRefs = { customerRef: ref };

    return data;
};

// Main Execution
const inputPath = path.join(__dirname, '../audit_json_results/proforma_1530.pdf.json');

try {
    const rawContent = fs.readFileSync(inputPath, 'utf8');
    const rawData = JSON.parse(rawContent);

    console.log("--- SIMULATING VIEWER STATE FOR 1530.pdf ---");
    const viewerState = normalizeNicolazziData(rawData);

    console.log(JSON.stringify(viewerState, null, 2));

} catch (e) {
    console.error("Error running simulation:", e);
}
