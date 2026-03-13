import React, { useState, useEffect } from 'react';
import AxaOrderViewer from './AxaOrderViewer';
import api from '../../api/apiClient';

/**
 * AxaOrderContainer
 * Manages loading, saving, and PDF synchronization for AXA Order Confirmations.
 */
export default function AxaOrderContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
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
                if (!finalData) finalData = { lines: [], metadata: {} };
                if (!finalData.lines) finalData.lines = [];
                if (!finalData.metadata) finalData.metadata = {};

                setAxaData(finalData);

            } catch (err) {
                console.error("[AxaContainer] Load Failed:", err);
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
            updateRow(doc.id, 'docNumber', newData.metadata?.doc_number);
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
                docNumber: dataToSave.metadata?.doc_number,
                date: dataToSave.metadata?.doc_date,
                total: totalSiva,
                supplier: 'AXA',
                customer: 'DVTK' // Defaulting based on context usually
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

    const handleReconcile = async () => {
        try {
            const res = await api.post(`/api/axa-fima/reconcile-oc/${doc.id}`);
            if (res.data?.success) {
                alert(`✅ Confirmação ligada à proposta "${res.data.proposal}"!`);
            } else {
                alert(`⚠️ Não foi possível ligar: ${res.data?.reason || 'Referência de proforma não encontrada.'}`);
            }
        } catch (err) {
            alert('Erro ao reconciliar: ' + (err.response?.data?.error || err.message));
        }
    };

    return (
        <AxaOrderViewer
            doc={doc}
            data={axaData}
            loading={loading}
            saving={saving}
            pdfUrl={pdfUrl}
            onDataChange={handleDataChange}
            onSave={handleSave}
            onClose={handleClose}
            onFinalize={onFinalize}
            onReconcile={handleReconcile}
            mode={mode}
        />
    );
}
