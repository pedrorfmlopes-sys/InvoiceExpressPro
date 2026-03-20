import React, { useState, useEffect } from 'react';
import FimaOrderViewer from './FimaOrderViewer';
import api from '../../api/apiClient';

/**
 * FimaOrderContainer
 * Manages loading, saving, and PDF sync for FIMA Order Confirmations (CONFIRMACION PEDIDO).
 */
export default function FimaOrderContainer({ doc, onClose, updateRow, onFinalize, mode = 'staging' }) {
    const [fimaData, setFimaData] = useState(null);
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
                const [pdfRes, mainRes] = await Promise.all([
                    api.get(`/api/corev2/docs/${doc.id}/view?project=${project}`, { responseType: 'blob' }),
                    api.get(`/api/corev2/docs/${doc.id}/json?project=${project}`)
                ]);
                if (!isMounted) return;
                if (pdfRes.status === 200) setPdfUrl(URL.createObjectURL(pdfRes.data));

                let finalData = mainRes?.data?.rawJson;
                if (!finalData && doc.rawJson) finalData = doc.rawJson;
                if (typeof finalData === 'string') finalData = JSON.parse(finalData);
                if (!finalData) finalData = { lines: [], metadata: {}, entities: {} };
                if (!finalData.lines) finalData.lines = [];
                if (!finalData.metadata) finalData.metadata = {};
                if (!finalData.entities) finalData.entities = {};

                setFimaData(finalData);
            } catch (err) {
                console.error('[FimaOrderContainer] Load Failed:', err);
                setFimaData({ lines: [], metadata: {}, entities: {} });
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        return () => { isMounted = false; };
    }, [doc.id]);

    useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

    useEffect(() => {
        const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleDataChange = (newData) => {
        setFimaData(newData);
        setIsDirty(true);
        if (updateRow) updateRow(doc.id, 'docNumber', newData.metadata?.doc_number);
    };

    const handleSave = async (currentData) => {
        try {
            setSaving(true);
            const project = doc.project || 'default';
            await api.put(`/api/corev2/docs/${doc.id}/json?project=${project}`, { payload: currentData });
            setIsDirty(false);
        } catch (err) {
            alert('Erro ao gravar: ' + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
    };

    const handleFinalize = async (currentData) => {
        if (!confirm('Confirmar e arquivar este documento?')) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';
            // 1. Sync data to DB
            await api.put(`/api/corev2/docs/${doc.id}/json?project=${project}`, { payload: currentData });
            
            // 2. Delegate to parent if available (correct API call happens there)
            if (onFinalize) {
                await onFinalize(doc.id);
            } else {
                // Fallback for direct finalize (ensuring correct URL)
                await api.post(`/api/corev2/docs/finalize?project=${project}`, { 
                    id: doc.id,
                    docType: currentData.metadata?.doc_type || doc.docType,
                    docNumber: currentData.metadata?.doc_number || doc.docNumber
                });
            }
            
            setIsDirty(false);
            onClose();
        } catch (err) {
            alert('Erro ao finalizar: ' + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
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

    const handleClose = () => {
        if (isDirty) {
            if (!confirm("Existem alterações não guardadas. Sair mesmo assim?")) return;
        }
        onClose();
    };

    return (
        <FimaOrderViewer
            doc={doc}
            data={fimaData}
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
