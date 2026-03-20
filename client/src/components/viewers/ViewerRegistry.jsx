import React from 'react';
import NicolazziInvoiceContainer from './NicolazziInvoiceContainer'; // Refactored to Container
import NicolazziGoldViewer from './NicolazziGoldViewer'; // Classic Layout (Fixed)
import NicolazziProformaViewer from './NicolazziProformaViewer'; // Modern Layout
import NicolazziProformaContainer from './NicolazziProformaContainer';
import RitmonioContainer from './RitmonioContainer';
import AxaOrderContainer from './AxaOrderContainer';
import AxaInvoiceContainer from './AxaInvoiceContainer';
import AxaProformaContainer from './AxaProformaContainer';
import FimaOrderContainer from './FimaOrderContainer';
import FimaProformaContainer from './FimaProformaContainer';
import FimaInvoiceContainer from './FimaInvoiceContainer';
import ScarabeoProformaContainer from './ScarabeoProformaContainer';
import ScarabeoInvoiceContainer from './ScarabeoInvoiceContainer';
import ButoPresupuestoContainer from './ButoPresupuestoContainer';
import ButoPedidoContainer from './ButoPedidoContainer';
import ButoFaturaContainer from './ButoFaturaContainer';


// Helper to safely get supplier name
const getSupplierName = (doc) => {
    if (!doc) return '';
    const mainSupplier = doc.supplier || (doc.entities?.supplier?.name);
    if (!mainSupplier) return '';
    if (typeof mainSupplier === 'string') return mainSupplier.toUpperCase();
    if (typeof mainSupplier === 'object' && mainSupplier.name) return mainSupplier.name.toUpperCase();
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
            const isProforma = type.includes('proforma') || type.includes('pro-forma') || type.includes('conferma') || type.includes('confirmation') || doc.type === 'source' || doc.type === 'order_confirmation';
            return isNicolazzi && isProforma;
        },
        Component: NicolazziProformaContainer
    },
    {
        name: 'Ritmonio Universal',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            return supplier.includes('RITMONIO') || doc.supplier === 'RITMONIO';
        },
        Component: RitmonioContainer
    },
    {
        name: 'AXA C.Pedido (OC)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isAxa = supplier.includes('AXA') || supplier.includes('COLAVENE') || doc.supplier === 'AXA';
            const isOrder = type.includes('c_pedido') || type.includes('order_confirmation') || type.includes('conferma') || type.includes('ordine');
            return isAxa && isOrder;
        },
        Component: AxaOrderContainer
    },
    {
        name: 'AXA Invoice',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isAxa = supplier.includes('AXA') || supplier.includes('COLAVENE') || doc.supplier === 'AXA';
            const isInvoice = type.includes('fatura') || type.includes('invoice') || type.includes('fattura') || type.includes('ft') || doc.type === 'invoice';
            return isAxa && isInvoice;
        },
        Component: AxaInvoiceContainer
    },
    {
        name: 'AXA Proforma (PA)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isAxa = supplier.includes('AXA') || supplier.includes('COLAVENE') || doc.supplier === 'AXA';
            const isProforma = type.includes('proforma') || type.includes('pro-forma');
            return isAxa && isProforma;
        },
        Component: AxaProformaContainer
    },
    {
        name: 'FIMA C.Pedido',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            return (supplier.includes('FIMA') || doc.supplier === 'FIMA') && (type.includes('c_pedido') || type.includes('confirmacion') || type.includes('confirmacao'));
        },
        Component: FimaOrderContainer
    },
    {
        name: 'FIMA Proforma',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            return (supplier.includes('FIMA') || doc.supplier === 'FIMA') && type.includes('proforma');
        },
        Component: FimaProformaContainer
    },
    {
        name: 'FIMA Invoice',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            return (supplier.includes('FIMA') || doc.supplier === 'FIMA') && (type.includes('invoice') || type.includes('fatura') || type.includes('factura'));
        },
        Component: FimaInvoiceContainer
    },
    {
        name: 'SCARABEO Proforma',
        match: (doc) => {
            const supplier = getSupplierName(doc);
            const type = (doc.docType || '').toLowerCase();
            const typeManual = (doc.type || '').toLowerCase();
            const isScarabeo = supplier.includes('SCARABEO') || doc.supplier === 'SCARABEO';
            if (!isScarabeo) return false;
            // Catch anything explicitly proforma OR anything that isn't an invoice (defaulting to the starter doc)
            return type.includes('proforma') || typeManual === 'source' || (!type.includes('invoice') && !type.includes('fatura'));
        },
        Component: ScarabeoProformaContainer
    },
    {
        name: 'SCARABEO Invoice',
        match: (doc) => {
            const supplier = getSupplierName(doc);
            const type = (doc.docType || '').toLowerCase();
            const typeManual = (doc.type || '').toLowerCase();
            const isScarabeo = supplier.includes('SCARABEO') || doc.supplier === 'SCARABEO';
            if (!isScarabeo) return false;
            // Catch anything that smells like invoice, fatura, or even order confirmation (since Scarabeo invoices are often mislabeled as such)
            return type.includes('invoice') || type.includes('fatura') || type.includes('factura') || type === 'scarabeo_invoice' || typeManual === 'invoice' || typeManual === 'order_confirmation' || type.includes('c_pedido');
        },
        Component: ScarabeoInvoiceContainer
    },
    {
        name: 'BUTÖ Presupuesto (Proposta)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isButo = supplier.includes('BUTO') || doc.supplier === 'BUTO';
            return isButo && (type === 'quote' || type.includes('presupuesto') || type.includes('proposta'));
        },
        Component: ButoPresupuestoContainer
    },
    {
        name: 'BUTÖ Pedido (Encomenda)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isButo = supplier.includes('BUTO') || doc.supplier === 'BUTO';
            return isButo && (type === 'order' || type.includes('pedido') || type.includes('encomenda'));
        },
        Component: ButoPedidoContainer
    },
    {
        name: 'BUTÖ Fatura (Invoice)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            const type = (doc.docType || doc.docTypeLabel || '').toLowerCase();
            const isButo = supplier.includes('BUTO') || doc.supplier === 'BUTO';
            return isButo && (type === 'invoice' || type.includes('factura') || type.includes('fatura'));
        },
        Component: ButoFaturaContainer
    },
    {
        name: 'BUTÖ Universal (fallback)',
        match: (doc) => {
            const supplier = getSupplierName(doc).toUpperCase();
            return supplier.includes('BUTO') || doc.supplier === 'BUTO';
        },
        Component: ButoPresupuestoContainer
    },

    {
        name: 'Simple PDF Viewer',
        match: () => true, // Fallback for everything else
        Component: SimpleDocViewer
    }
];

export function getViewer(doc) {
    if (!doc) return null;
    const entry = viewers.find(v => v.match(doc));
    if (entry && (entry.name.includes('SCARABEO'))) {
        console.log(`[ViewerRegistry] Matched ${entry.name} for doc:`, doc.id, {
            supplier: getSupplierName(doc),
            docType: doc.docType,
            type: doc.type
        });
    }
    return entry ? entry.Component : null;
}
