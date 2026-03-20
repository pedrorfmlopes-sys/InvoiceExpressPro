import React, { useState, useEffect } from 'react';
import AxaInvoiceViewer from './AxaInvoiceViewer';
import api from '../../api/apiClient';

/**
 * AxaInvoiceContainer
 * Manages loading, saving, and PDF synchronization for AXA Invoices.
 */
export default function AxaInvoiceContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
    const [axaData, setAxaData] = useState(null);
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

                let finalData = mainRes?.data?.rawJson;
                if (!finalData && doc.rawJson) {
                    finalData = doc.rawJson;
                }

                if (typeof finalData === 'string') {
                    finalData = JSON.parse(finalData);
                }

                // Normalization fallback just in case
                if (!finalData) finalData = { lines: [] };
                if (!finalData.lines) finalData.lines = [];
                // Handle different engines root keys
                const metadata = finalData.metadata || {
                    doc_number: finalData.docNumber,
                    doc_date: finalData.dates?.issued
                };
                finalData.metadata = metadata;

                setAxaData(finalData);

            } catch (err) {
                console.error("[AxaInvoiceContainer] Load Failed:", err);
                setAxaData({ lines: [], metadata: {} });
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        return () => isMounted = false;
    }, [doc.id]);

    useEffect(() => {
        return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    }, [pdfUrl]);

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

    const handleDataChange = (newData) => {
        setAxaData(newData);
        setIsDirty(true);
        if (updateRow) {
            updateRow(doc.id, 'docNumber', newData.metadata?.doc_number || newData.docNumber);
        }
    };

    const handleSave = async (dataToSave = axaData) => {
        if (!dataToSave) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';

            const totalSiva = dataToSave.lines.reduce((acc, line) => acc + (parseFloat(line.total_siva) || 0), 0);

            await api.patch(`/api/corev2/docs/${doc.id}?project=${project}`, {
                rawJson: dataToSave,
                docNumber: dataToSave.metadata?.doc_number || dataToSave.docNumber,
                date: dataToSave.metadata?.doc_date || dataToSave.dates?.issued,
                total: totalSiva,
                supplier: 'AXA'
            });

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

    const handleFinalize = async (dataToSave = axaData) => {
        const saved = await handleSave(dataToSave);
        if (!saved) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';
            // Delegate to parent if available (correct API call happens there)
            if (onFinalize) {
                await onFinalize(doc.id);
            } else {
                // Fallback for direct finalize (ensuring correct URL)
                await api.post(`/api/corev2/docs/finalize?project=${project}`, { 
                    id: doc.id,
                    docType: dataToSave.metadata?.doc_type || doc.docType,
                    docNumber: dataToSave.metadata?.doc_number || dataToSave.docNumber
                });
            }
        } catch (err) {
            alert('Erro ao finalizar: ' + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
    };

    const handleReconcile = async () => {
        try {
            const res = await api.post(`/api/axa-fima/reconcile/${doc.id}`);
            if (res.data?.success) {
                alert(`✅ Fatura ligada à proposta "${res.data.proposal}"! (${res.data.matched_lines}/${res.data.total_lines} linhas correspondidas)`);
            } else {
                alert(`⚠️ Não foi possível ligar: ${res.data?.reason || 'Referência de proforma não encontrada.'}`);
            }
        } catch (err) {
            alert('Erro ao reconciliar: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleClose = () => {
        if (isDirty) {
            if (!confirm("Existem alterações não guardadas. Sair mesmo assim?")) return;
        }
        onClose();
    };

    return (
        <AxaInvoiceViewer
            doc={doc}
            data={axaData}
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
