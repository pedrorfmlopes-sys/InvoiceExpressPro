import React, { useState, useEffect } from 'react';
import RitmonioViewer from './RitmonioViewer';
import api from '../../api/apiClient';
import { normalizeInvoiceData } from './nicolazziInvoiceUtils';

/**
 * RitmonioContainer
 * Handles data loading, saving, and state management for Ritmonio documents.
 */
export default function RitmonioContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {

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

                const pPdf = api.get(`/api/corev2/docs/${doc.id}/view?project=${project || 'all'}`, { responseType: 'blob' });
                // We point to a generic extraction data endpoint or use the raw json
                // We can use doc.rawJson directly since the new engine standardizes it nicely

                let pSat = null;
                if (doc.docType === 'invoice') {
                    pSat = api.get(`/api/corev2/extraction-data/ritmonio_invoices/${doc.id}?project=${project || 'all'}`).catch(() => ({ data: null }));
                }

                const pMain = api.get(`/api/corev2/docs/${doc.id}/json?project=${project || 'all'}`).catch(() => ({ data: {} }));

                const [pdfRes, satRes, mainRes] = await Promise.all([pPdf, pSat || { data: null }, pMain]);

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
                console.error("[RitmonioContainer] Load Failed:", err);
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

    const handleSave = async (dataToSave) => {
        setSaving(true);
        try {
            await api.put(`/api/corev2/docs/${doc.id}/json?project=${doc.project || 'all'}`, { payload: JSON.stringify(dataToSave) });
            setInvoiceData(normalizeInvoiceData(dataToSave));
            setIsDirty(false);
            if (updateRow) updateRow(doc.id, { rawJson: JSON.stringify(dataToSave) });
        } catch (err) {
            console.error("[RitmonioContainer] Save Failed:", err);
            alert("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    const handleFinalize = async (dataToSave = invoiceData) => {
        try {
            await handleSave(dataToSave);
            if (onFinalize) {
                await onFinalize(doc.id);
            } else {
                const project = doc.project || 'default';
                await api.post(`/api/corev2/docs/finalize?project=${project}`, { 
                    id: doc.id,
                    docType: doc.docType,
                    docNumber: dataToSave.docNumber || doc.docNumber
                });
            }
        } catch (err) {
            console.error("[RitmonioContainer] Finalize Failed:", err);
            alert("Erro ao finalizar.");
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
        <RitmonioViewer
            doc={doc} // Metadata context
            data={invoiceData} // The Source of Truth
            loading={loading}
            saving={saving}
            pdfUrl={pdfUrl}

            // Actions
            onDataChange={handleDataChange}
            onSave={handleSave}
            onClose={handleClose}
            onFinalize={handleFinalize}

            mode={mode} // 'staging' or 'archive'
        />
    );
}
