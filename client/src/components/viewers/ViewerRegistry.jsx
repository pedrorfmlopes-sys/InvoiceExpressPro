import React from 'react';
import NicolazziInvoiceContainer from './NicolazziInvoiceContainer'; // Refactored to Container
import NicolazziGoldViewer from './NicolazziGoldViewer'; // Classic Layout (Fixed)
import NicolazziProformaViewer from './NicolazziProformaViewer'; // Modern Layout
import NicolazziProformaContainer from './NicolazziProformaContainer';

// Helper to safely get supplier name
const getSupplierName = (doc) => {
    if (!doc || !doc.supplier) return '';
    if (typeof doc.supplier === 'string') return doc.supplier.toUpperCase();
    if (typeof doc.supplier === 'object' && doc.supplier.name) return doc.supplier.name.toUpperCase();
    return '';
};

// Rule-based registry
const viewers = [
    {
        name: 'Nicolazzi Invoice',
        match: (doc) => {
            const supplier = getSupplierName(doc);
            const type = (doc.docType || '').toLowerCase();
            return supplier.includes('NICOLAZZI') && (type === 'fatura' || type === 'invoice');
        },
        Component: NicolazziInvoiceContainer // Now points to Container
    },
    {
        name: 'Nicolazzi Proforma (Gold)',
        match: (doc) => {
            const supplier = getSupplierName(doc);
            const type = (doc.docType || '').toLowerCase();
            return supplier.includes('NICOLAZZI') && type === 'proforma';
        },
        Component: NicolazziProformaContainer
    }
];

export function getViewer(doc) {
    const entry = viewers.find(v => v.match(doc));
    return entry ? entry.Component : null;
}
