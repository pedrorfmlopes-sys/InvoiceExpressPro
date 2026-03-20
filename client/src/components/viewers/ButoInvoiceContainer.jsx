import React, { useState, useEffect } from 'react';
import ButoInvoiceViewer from './ButoInvoiceViewer';
import api from '../../api/apiClient';

/**
 * ButoInvoiceContainer
 * Logic wrapper to fetch JSON and PDF for Buto Invoices.
 */
export default function ButoInvoiceContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
    const [butoData, setButoData] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        let isMounted = true;
        async function load() {
            try {
                setLoading(true);
                const project = doc.project || 'default';

                const pPdf = api.get(`/api/corev2/docs/${doc.id}/view?project=${project}`, { responseType: 'blob' });
                const pMain = api.get(`/api/corev2/docs/${doc.id}/json?project=${project}`);

                const [pdfRes, mainRes] = await Promise.all([pPdf, pMain]);

                if (!isMounted) return;

                if (pdfRes.status === 200) {
                    setPdfUrl(URL.createObjectURL(pdfRes.data));
                }

                let finalData = mainRes?.data?.rawJson || doc.rawJson;
                if (typeof finalData === 'string') finalData = JSON.parse(finalData);
                
                setButoData(finalData || { lines: [], totals: {} });
            } catch (err) {
                console.error("[ButoInvoiceContainer] Load Failed:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        return () => { isMounted = false; };
    }, [doc.id]);

    useEffect(() => {
        return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    }, [pdfUrl]);

    const handleDataChange = (newData) => {
        setButoData(newData);
        setIsDirty(true);
        if (updateRow) {
            updateRow(doc.id, 'docNumber', newData.docNumber);
        }
    };

    const handleSave = async (dataToSave = butoData) => {
        if (!dataToSave) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';
            await api.patch(`/api/corev2/docs/${doc.id}?project=${project}`, {
                rawJson: dataToSave,
                docNumber: dataToSave.docNumber,
                date: dataToSave.dates?.issued,
                total: dataToSave.totals?.total,
                supplier: 'BUTO'
            });
            setIsDirty(false);
            return true;
        } catch (err) {
            alert("Erro ao gravar: " + err.message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleFinalize = async (dataToSave = butoData) => {
        const saved = await handleSave(dataToSave);
        if (!saved) return;
        try {
            setSaving(true);
            if (onFinalize) {
                await onFinalize(doc.id);
            } else {
                await api.post(`/api/corev2/docs/finalize`, { id: doc.id });
            }
        } catch (err) {
            alert('Erro ao finalizar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReconcile = async () => {
        alert("Reconciliação automática para Butö em desenvolvimento.");
    };

    const handleClose = () => {
        if (isDirty && !confirm("Sair sem guardar?")) return;
        onClose();
    };

    return (
        <ButoInvoiceViewer
            doc={doc}
            data={butoData}
            loading={loading}
            saving={saving}
            pdfUrl={pdfUrl}
            onDataChange={handleDataChange}
            onSave={handleSave}
            onClose={handleClose}
            onFinalize={handleFinalize}
            onReconcile={handleReconcile}
            mode={mode}
        />
    );
}
