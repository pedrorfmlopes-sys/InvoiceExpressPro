import React, { useState, useEffect } from 'react';
import NicolazziProformaViewer from './NicolazziProformaViewer';
import NicolazziGoldViewer from './NicolazziGoldViewer';
import api from '../../api/apiClient';
import { normalizeNicolazziData } from './nicolazziUtils';

/**
 * NicolazziProformaContainer
 * Handles toggling between Modern and Gold viewers for Nicolazzi Proformas.
 * Centralizes data loading and state to prevent loss on switch.
 */
export default function NicolazziProformaContainer(props) {
    const { doc, onClose, updateRow, mode = 'staging' } = props;
    const [viewType, setViewType] = useState('modern'); // 'modern' or 'classic'

    // Centralized State
    const [satelliteData, setSatelliteData] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // 1. Initial Load (PDF + Satellite JSON)
    useEffect(() => {
        let isMounted = true;
        async function load() {
            try {
                setLoading(true);
                const project = doc.project || 'default';

                // Parallel load: PDF and Data
                const [pdfRes, dataRes] = await Promise.all([
                    api.get(`/api/corev2/docs/${doc.id}/view?project=${project}`, { responseType: 'blob' }),
                    api.get(`/api/corev2/extraction-data/nicolazzi_proformas/${doc.id}?project=${project}`)
                ]);

                if (!isMounted) return;

                const url = URL.createObjectURL(pdfRes.data);
                setPdfUrl(url);
                setSatelliteData(normalizeNicolazziData(dataRes.data));
            } catch (err) {
                console.error("Failed to load container data", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        return () => {
            isMounted = false;
        };
    }, [doc.id]);

    // Cleanup PDF URL on unmount
    useEffect(() => {
        return () => {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        };
    }, [pdfUrl]);

    // 2. Browser-level protection (Refresh/Tab Close)
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

    // 3. Handlers
    const toggleViewer = () => setViewType(prev => prev === 'modern' ? 'classic' : 'modern');

    const handleDataChange = (newData) => {
        setSatelliteData(newData);
        setIsDirty(true);

        // Live background sync (UI only) - Phase 19
        if (updateRow) {
            const total = newData.totals?.gross || newData.total;
            if (total !== doc.total) updateRow(doc.id, 'total', total);
            if (newData.docNumber !== doc.docNumber) updateRow(doc.id, 'docNumber', newData.docNumber);
            if (newData.date !== doc.date) updateRow(doc.id, 'date', newData.date);

            const cusName = (typeof newData.entities?.customer === 'object') ? newData.entities.customer.name : newData.entities?.customer;
            if (cusName !== doc.customer) updateRow(doc.id, 'customer', cusName);
        }
    };

    const handleSave = async (dataToSave = satelliteData) => {
        if (!dataToSave) return;
        try {
            setSaving(true);
            const project = doc.project || 'default';

            // Unified Save (Main DB)
            await api.patch(`/api/corev2/docs/${doc.id}?project=${project}`, {
                rawJson: dataToSave,
                docNumber: dataToSave.docNumber,
                date: dataToSave.date,
                total: dataToSave.totals?.gross || dataToSave.total,
                customer: (typeof dataToSave.entities?.customer === 'object') ? dataToSave.entities.customer.name : dataToSave.entities?.customer,
                supplier: (typeof dataToSave.entities?.supplier === 'object') ? dataToSave.entities.supplier.name : dataToSave.entities?.supplier
            });

            // Satellite sync (Legacy/Redundancy)
            if (mode !== 'archive') {
                await api.post(`/api/corev2/extraction-data/nicolazzi_proformas/${doc.id}?project=${project}`, dataToSave);
            }

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

    const handleOnClose = () => {
        if (isDirty) {
            if (!window.confirm("Tens alterações não guardadas. Queres mesmo sair?")) {
                return;
            }
        }
        onClose();
    };

    const commonProps = {
        ...props,
        onClose: handleOnClose,
        onSwitch: toggleViewer,
        satelliteData,      // For Gold
        setSatelliteData: handleDataChange,
        data: satelliteData, // For Modern
        setData: handleDataChange,
        pdfUrl,
        loading,
        saving,
        isSaving: saving,
        onSave: handleSave
    };

    if (viewType === 'classic') {
        return <NicolazziGoldViewer {...commonProps} />;
    }

    return <NicolazziProformaViewer {...commonProps} />;
}
