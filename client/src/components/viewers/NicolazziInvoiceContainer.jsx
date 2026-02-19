import React, { useState, useEffect } from 'react';
import NicolazziInvoiceViewer from './NicolazziInvoiceViewer';
import api from '../../api/apiClient';
import { normalizeInvoiceData } from './nicolazziInvoiceUtils';

/**
 * NicolazziInvoiceContainer
 * Handles data loading, saving, and state management for Nicolazzi INVOICES.
 * Dedicated component to isolate logic from presentation.
 */
export default function NicolazziInvoiceContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {

    // Centralized Data State
    const [invoiceData, setInvoiceData] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);

    // Status State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // 1. Initial Load (PDF + Data)
    useEffect(() => {
        let isMounted = true;
        async function load() {
            try {
                setLoading(true);
                const project = doc.project || 'default';

                // Parallel Requests: 
                // A. PDF View
                // B. Data (Satellite -> Main Doc Fallback -> Raw Prop Fallback)

                // Note: We use the logic from the old viewer here, but cleaner.
                // Try Satellite first, if fail, rely on Main Doc.

                const pPdf = api.get(`/api/corev2/docs/${doc.id}/view?project=${project}`, { responseType: 'blob' });
                const pSat = api.get(`/api/corev2/extraction-data/nicolazzi_invoices/${doc.id}?project=${project}`).catch(() => ({ data: null }));
                const pMain = api.get(`/api/corev2/docs/${doc.id}/json?project=${project}`).catch(() => ({ data: {} }));

                const [pdfRes, satRes, mainRes] = await Promise.all([pPdf, pSat, pMain]);

                if (!isMounted) return;

                // PDF Logic
                if (pdfRes.status === 200) {
                    const url = URL.createObjectURL(pdfRes.data);
                    setPdfUrl(url);
                }

                // Data Merge Logic (Satellite > Main Doc > Prop)
                let finalData = satRes?.data;

                if (!finalData || Object.keys(finalData).length === 0) {
                    // Fallback to Main Doc
                    const raw = mainRes?.data?.rawJson;
                    if (raw) {
                        finalData = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    }
                }

                if (!finalData && doc.rawJson) {
                    finalData = typeof doc.rawJson === 'string' ? JSON.parse(doc.rawJson) : doc.rawJson;
                }

                // Normalize using our NEW dedicated utility
                const cleanData = normalizeInvoiceData(finalData);
                setInvoiceData(cleanData);

            } catch (err) {
                console.error("[InvoiceContainer] Load Failed:", err);
                // Fallback to empty structure to avoid crashes
                setInvoiceData(normalizeInvoiceData({}));
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        return () => {
            isMounted = false;
        };
    }, [doc.id]);

    // Cleanup PDF
    useEffect(() => {
        return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    }, [pdfUrl]);

    // Protect Unsaved Changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // Handlers
    const handleDataChange = (newData) => {
        setInvoiceData(newData);
        setIsDirty(true);

        // Live Row Update (Optional, keeps Explorer responsive)
        if (updateRow) {
            if (newData.totals?.gross !== doc.total) updateRow(doc.id, 'total', newData.totals?.gross);
            if (newData.docNumber !== doc.docNumber) updateRow(doc.id, 'docNumber', newData.docNumber);
        }
    };

    const handleSave = async (dataToSave = invoiceData) => {
        if (!dataToSave) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';

            // 1. Unified Save to Main DB (Critical)
            // Patch the doc metrics so sorting/filtering works
            await api.patch(`/api/corev2/docs/${doc.id}?project=${project}`, {
                rawJson: dataToSave,
                docNumber: dataToSave.docNumber,
                date: dataToSave.date,
                total: dataToSave.totals?.gross || dataToSave.total,
                customer: (typeof dataToSave.entities?.customer === 'object') ? dataToSave.entities.customer.name : dataToSave.entities?.customer,
                supplier: (typeof dataToSave.entities?.supplier === 'object') ? dataToSave.entities.supplier.name : dataToSave.entities?.supplier
            });

            // 2. Satellite Save (Redundancy / History)
            // Even if the table doesn't exist, we try. Backend usually handles creating it.
            await api.post(`/api/corev2/extraction-data/nicolazzi_invoices/${doc.id}?project=${project}`, dataToSave);

            setIsDirty(false);
            return true;

        } catch (err) {
            console.error("Save failed:", err);
            alert("Erro ao gravar: " + (err.response?.data?.error || err.message));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        if (isDirty) {
            if (!confirm("Existem alterações não guardadas. Sair mesmo assim?")) return;
        }
        onClose();
    };

    // Render the Pure Viewer
    return (
        <NicolazziInvoiceViewer
            doc={doc} // Metadata context
            data={invoiceData} // The Source of Truth
            loading={loading}
            saving={saving}
            pdfUrl={pdfUrl}

            // Actions
            onDataChange={handleDataChange}
            onSave={handleSave}
            onClose={handleClose}
            onFinalize={onFinalize}

            mode={mode} // 'staging' or 'archive'
        />
    );
}
