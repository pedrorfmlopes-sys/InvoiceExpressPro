/**
 * nicolazziUtils.js
 * Shared logic for Nicolazzi Proforma/Invoice Viewers
 */

export const normalizeNicolazziData = (rawData) => {
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

    // shipTo Fallback: If shipTo is missing or invalid, fallback to customer address
    if (!data.entities.shipTo || (!data.entities.shipTo.name && !data.entities.shipTo.address)) {
        data.entities.shipTo = {
            name: data.entities.customer.name || '',
            address: data.entities.customer.deliveryAddress || data.entities.customer.address || ''
        };
    }

    // 3. Normalize Totals (Ensure numeric safety)
    data.totals = data.totals || {};

    // Fallback chain for subtotal
    const rawNet = data.totals.net || data.totals.goods || data.totals.subtotal || 0;
    let net = parseFloat(rawNet) || 0;

    // If net is 0 but we have lines, try to sum them (Initial load fallback)
    if (net === 0 && data.lines.length > 0) {
        net = data.lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
    }

    data.totals.net = net.toFixed(2);
    data.totals.goods = data.totals.net; // Sync both keys
    data.totals.vat = String(data.totals.vat || data.totals.tax || '0.00');
    data.totals.transport = String(data.totals.transport || '0.00');

    const vat = parseFloat(data.totals.vat) || 0;
    const transport = parseFloat(data.totals.transport) || 0;
    data.totals.gross = (net + vat + transport).toFixed(2);

    // 4. Normalize References (The Regression Fix)
    // Extractor might send docRefs as object or array
    let ref = '';
    if (Array.isArray(data.docRefs) && data.docRefs.length > 0) {
        ref = data.docRefs[0];
    } else if (data.docRefs && typeof data.docRefs === 'object') {
        ref = data.docRefs.customerRef || '';
    } else if (data.customerRef) {
        ref = data.customerRef;
    }

    data.customerRef = ref;
    // Keep docRefs synced for components that might still use it
    data.docRefs = { customerRef: ref };

    // 5. Preserve Metadata (Phase 17/30)
    // Ensure we don't lose the project or file info which is in the root doc object
    data.project = rawData.project || data.project;
    data.original_file = rawData.original_file || data.original_file;
    data.id = rawData.id || data.id;

    // Phase 30: If project is still missing or looks like an ID, and we have a ref, use it for UI
    if (!data.projectLabel) {
        data.projectLabel = data.customerRef || data.project || 'Sem Projeto';
    }

    return data;
};
