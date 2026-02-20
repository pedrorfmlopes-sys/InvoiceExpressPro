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

import SimpleDocViewer from './SimpleDocViewer';

// Rule-based registry
const viewers = [
    {
        name: 'Nicolazzi Invoice',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isNicolazzi = supplier.includes('NICOLAZZI') || doc.supplier === 'NICOLAZZI';
            const isInvoice = type.includes('fatura') || type.includes('invoice') || type.includes('fattura') || type.includes('ft') || doc.type === 'invoice';
            return isNicolazzi && isInvoice;
        },
        Component: NicolazziInvoiceContainer
    },
    {
        name: 'Nicolazzi Proforma (Gold)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isNicolazzi = supplier.includes('NICOLAZZI') || doc.supplier === 'NICOLAZZI';
            const isProforma = type.includes('proforma') || type.includes('pro-forma') || doc.type === 'source';
            return isNicolazzi && isProforma;
        },
        Component: NicolazziProformaContainer
    },
    {
        name: 'Simple PDF Viewer',
        match: () => true, // Fallback for everything else
        Component: SimpleDocViewer
    }
];

export function getViewer(doc) {
    const entry = viewers.find(v => v.match(doc));
    return entry ? entry.Component : null;
}
