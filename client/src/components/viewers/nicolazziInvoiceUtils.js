/**
 * nicolazziInvoiceUtils.js
 * Dedicated logic for Nicolazzi INVOICE Viewer normalization.
 * independent of Proformas to ensure stability.
 */

export const normalizeInvoiceData = (rawData) => {
    // 1. Safety Check
    if (!rawData) return { lines: [], totals: {}, entities: { customer: {}, supplier: {}, shipTo: {} } };

    const data = { ...rawData };

    // 2. Normalize Lines
    data.lines = (Array.isArray(data.lines) ? data.lines : []).map(l => ({
        ...l,
        // Invoice Extractor specific adjustments
        discountPercent: l.discountPercent || l.discountText || '',
        unitPrice: parseFloat(l.unitPrice) || 0,
        quantity: parseFloat(l.quantity) || 0,
        total: parseFloat(l.total) || 0
    }));

    // 3. Normalize Entities
    data.entities = data.entities || {};
    data.entities.customer = data.entities.customer || {};
    data.entities.supplier = data.entities.supplier || {}; // Default Nicolazzi S.p.A usually

    // Invoices might have 'shipping' instead of 'shipTo' (Legacy extractor quirk)
    if (data.entities.shipping && !data.entities.shipTo) {
        data.entities.shipTo = data.entities.shipping;
    }

    // Fallback if shipTo is empty
    if (!data.entities.shipTo || (!data.entities.shipTo.name && !data.entities.shipTo.address)) {
        data.entities.shipTo = {
            name: data.entities.customer.name || '',
            address: data.entities.customer.deliveryAddress || data.entities.customer.address || ''
        };
    }

    // 4. Normalize Totals (Invoice Specfic)
    data.totals = data.totals || {};

    const net = parseFloat(data.totals.net || data.totals.goods || 0);
    const vat = parseFloat(data.totals.vat || data.totals.tax || 0);
    const transport = parseFloat(data.totals.transport || 0);

    // Recalculate Gross to ensure consistency
    data.totals.net = net.toFixed(2);
    data.totals.vat = vat.toFixed(2);
    data.totals.transport = transport.toFixed(2);
    data.totals.gross = (net + vat + transport).toFixed(2);

    // Sync 'total' alias
    data.totals.total = data.totals.gross;

    // 5. Normalize Metadata References
    // Keep them distinct now that we have separate fields.
    // docRefs = DDT
    // projectRef = Vostro Riferimento

    // 6. Ensure Shipping Marks (Crucial for User Request)
    // Never let this be undefined in the UI state
    data.shippingMarks = data.shippingMarks || '';

    return data;
};
