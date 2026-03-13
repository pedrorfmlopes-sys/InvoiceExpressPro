import React, { useState, useEffect } from 'react';
import ScarabeoProformaViewer from './ScarabeoProformaViewer';
import api from '../../api/apiClient';

/**
 * ScarabeoProformaContainer
 * Manages loading, saving, and PDF synchronization for Scarabeo Proformas.
 */
export default function ScarabeoProformaContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
    const [scarabeoData, setScarabeoData] = useState(null);
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

                let finalData = mainRes?.data?.rawJson || mainRes?.data?.payload;
                if (!finalData && doc.rawJson) {
                    finalData = typeof doc.rawJson === 'string' ? JSON.parse(doc.rawJson) : doc.rawJson;
                }

                if (typeof finalData === 'string') finalData = JSON.parse(finalData);

                if (!finalData) finalData = { lines: [], metadata: {} };
                if (!finalData.lines) finalData.lines = [];
                if (!finalData.metadata) finalData.metadata = {};

                // Ensure essential meta
                if (!finalData.metadata.doc_number && finalData.docNumber) finalData.metadata.doc_number = finalData.docNumber;
                if (!finalData.metadata.doc_date && finalData.date) finalData.metadata.doc_date = finalData.date;

                setScarabeoData(finalData);
            } catch (err) {
                console.error("[ScarabeoProformaContainer] Load Failed:", err);
                setScarabeoData({ lines: [], metadata: {} });
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
        setScarabeoData(newData);
        setIsDirty(true);
        if (updateRow) {
            updateRow(doc.id, 'docNumber', newData.metadata?.doc_number || newData.docNumber);
        }
    };

    const handleSave = async (dataToSave = scarabeoData) => {
        if (!dataToSave) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';

            const payloadData = { ...dataToSave };
            payloadData.docNumber = payloadData.metadata?.doc_number || payloadData.docNumber;
            payloadData.date = payloadData.metadata?.doc_date || payloadData.date;

            const total = payloadData.lines.reduce((acc, line) => acc + (parseFloat(line.total || 0)), 0);

            await api.patch(`/api/corev2/docs/${doc.id}?project=${project}`, {
                rawJson: payloadData,
                docNumber: payloadData.docNumber,
                date: payloadData.date,
                total: total,
                supplier: 'SCARABEO',
                customer: 'DVTK'
            });

            await api.put(`/api/corev2/docs/${doc.id}/json?project=${project}`, { payload: payloadData });

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

    const handleFinalize = async () => {
        const saved = await handleSave();
        if (!saved) return;

        try {
            setSaving(true);
            const project = doc.project || 'default';
            await api.post(`/api/corev2/docs/${doc.id}/finalize?project=${project}`);
            setIsDirty(false);
            if (onFinalize) onFinalize(doc.id);
            onClose();
        } catch (err) {
            alert('Erro ao finalizar: ' + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
    };

    const handleReconcile = async () => {
        try {
            const res = await api.post(`/api/nicolazzi/reconcile/${doc.id}`);
            if (res.data?.success) {
                alert(`✅ Sucesso! Proforma ligada à Proposta: ${res.data.proposal}`);
            } else {
                alert(`⚠️ Aviso: ${res.data?.reason || 'Não foi possível ligar.'}`);
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
        <ScarabeoProformaViewer
            doc={doc}
            data={scarabeoData}
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
