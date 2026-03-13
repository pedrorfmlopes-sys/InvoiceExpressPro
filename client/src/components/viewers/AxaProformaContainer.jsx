import React, { useState, useEffect } from 'react';
import AxaProformaViewer from './AxaProformaViewer';
import api from '../../api/apiClient';

/**
 * AxaProformaContainer
 * Manages loading, saving, and PDF synchronization for AXA Proformas.
 */
export default function AxaProformaContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
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

                if (!finalData) finalData = { lines: [] };
                if (!finalData.lines) finalData.lines = [];
                const metadata = finalData.metadata || {
                    doc_number: finalData.docNumber,
                    doc_date: finalData.dates?.issued
                };
                finalData.metadata = metadata;

                setAxaData(finalData);

            } catch (err) {
                console.error("[AxaProformaContainer] Load Failed:", err);
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

    const handleClose = () => {
        if (isDirty) {
            if (!confirm("Existem alterações não guardadas. Sair mesmo assim?")) return;
        }
        onClose();
    };

    return (
        <AxaProformaViewer
            doc={doc}
            data={axaData}
            loading={loading}
            saving={saving}
            pdfUrl={pdfUrl}
            onDataChange={handleDataChange}
            onSave={handleSave}
            onClose={handleClose}
            onFinalize={onFinalize}
            mode={mode}
        />
    );
}
