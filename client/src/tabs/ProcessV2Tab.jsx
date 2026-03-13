import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { qp } from '../shared/ui';
import api from '../api/apiClient';
import { GlassCard } from '../components/ui/GlassCard';
import ProfileEditor from '../components/extraction/ProfileEditor';
import { SplitScreenOverlay } from '../components/viewers/SplitScreenOverlay';
import { getViewer } from '../components/viewers/ViewerRegistry';

// -- ICONS --
const IconBrain = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0 -5.997 .13a5 5 0 0 0 -2.003 4.87a6 6 0 0 0 13 8.4m-4 -12.4a3 3 0 0 1 2.5 1.4m1.5 -1.4a5 5 0 0 1 5.6 5.6" /><path d="M12 18v4" /><path d="M8 22h8" /></svg>;
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" /><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" /></svg>;
const IconEye = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" /><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" /></svg>;
const IconArrowLeftRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 0-.5-.5H2.707l3.147 3.146a.5.5 0 1 0-.708.708l-4-4a.5.5 0 0 0 0-.708l4-4a.5.5 0 1 0 .708.708L2.707 4H14.5a.5.5 0 0 0 .5-.5z" /></svg>;

// Helper: Normalize DB string to Translation Key or Label
function normalizeDocType(val, availableTypes = []) {
    if (!val) return 'other';
    // 1. Try exact match in known types (slug/id or label)
    const exact = availableTypes.find(t => (t.slug || t.id) === val || (t.label || t.labelPt) === val);
    if (exact) return exact.slug || exact.id;

    // 2. Legacy Fallback (Substring)
    const v = String(val).toLowerCase().trim();
    if (v.includes('nota') && v.includes('credito')) return 'nota_credito';
    if (v.includes('fatura') && v.includes('recibo')) return 'fatura_recibo';
    if (v.includes('fatura') || v === 'invoice') return 'fatura';
    if (v.includes('recibo') || v === 'receipt') return 'recibo';
    if (v.includes('guia') || v === 'delivery') return 'guia_remessa';
    if (v.includes('proforma')) return 'proforma';
    if (v.includes('pedido') || v.includes('order')) return 'c_pedido';

    // 3. If it's a known custom slug content (e.g. from DB) but didn't match above rules?
    // We assume the value itself is the slug if not 'other'
    return val;
}

// Draggable Input Component (Defined Outside Row/ProcessTab to prevent re-mount focus loss)
const DInput = ({ rowId, field, value, className, prefix, onBlur, updateRow, handleDragStart, handleDrop }) => {
    return (
        <div className="flex items-center gap-2 group relative">

            {/* Drag Handle */}
            <div
                draggable
                onDragStart={(e) => handleDragStart(e, rowId, field, value)}
                className="cursor-grab active:cursor-grabbing opacity-10 group-hover:opacity-100 transition-opacity"
                title="Drag"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0" /></svg>
            </div>

            <div className={`relative flex items-center w-full ${prefix ? 'pl-4' : ''}`}>
                {prefix && <span className="absolute left-0 opacity-50 font-mono text-xs">{prefix}</span>}
                <input
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, rowId, field, value)}
                    className={`bg-transparent w-full outline-none transition-all ${className || ''}`}
                    value={value || ''}
                    onChange={(e) => updateRow(rowId, field, e.target.value)}
                    onBlur={(e) => {
                        if (onBlur) onBlur(e);
                    }}
                    placeholder={field === 'docNumber' ? 'Missing!' : ''}
                />
            </div>
        </div >
    )
}

export default function ProcessV2Tab({ project }) {
    const { t } = useTranslation();
    const [files, setFiles] = useState([]);
    const [batchId, setBatchId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStats, setProcessingStats] = useState({ done: 0, total: 0, errors: 0 });
    const [rows, setRows] = useState([]);
    const [showAdditional, setShowAdditional] = useState(false);
    const [busy, setBusy] = useState(false);

    // -- Selection State --
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [conflictState, setConflictState] = useState(null); // { conflicts, payload, results }
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeProgress, setFinalizeProgress] = useState(0);

    // Load Doc Types
    const [availableTypes, setAvailableTypes] = useState([]);
    useEffect(() => {
        api.get('/api/corev2/doctypes')
            .then(res => {
                const raw = res.data;
                const list = Array.isArray(raw) ? raw : (raw.types || []);
                setAvailableTypes(list);
            })
            .catch(err => console.error("Failed to load doctypes", err));
    }, []);

    // Create Type Action
    const createType = async (label) => {
        if (!label) return;
        try {
            const res = await api.post('/api/corev2/doctypes', { label });
            setAvailableTypes(prev => [...prev, res.data]);
            return res.data;
        } catch (e) {
            alert(e.message);
            return null;
        }
    };
    const [dragSrc, setDragSrc] = useState(null);
    const [dragModal, setDragModal] = useState(null);

    // -- View PDF State --
    const [activeReviewRow, setActiveReviewRow] = useState(null);

    // -- File Handling --
    const onDrop = useCallback((acceptedFiles) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] }
    });

    // -- Actions --
    async function startProcessing() {
        if (!files.length) return;
        setIsUploading(true);
        setUploadProgress(0);
        setProcessingProgress(0);
        setRows([]);
        setBatchId(null);
        setSelectedIds(new Set());

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));

        const apiKey = localStorage.getItem('OPENAI_API_KEY') || '';
        try {
            const res = await api.post(qp('/api/extract', project), formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(apiKey ? { 'X-OpenAI-Key': apiKey } : {})
                },
                onUploadProgress: (p) => {
                    const percent = Math.round((p.loaded * 100) / p.total);
                    setUploadProgress(percent);
                }
            });
            setBatchId(res.data.batchId);
            setProcessingStats({ done: 0, total: files.length, errors: 0 });
        } catch (e) {
            alert('Erro ao iniciar processamento: ' + e.message);
            setIsUploading(false); // Reset on fail
        } finally {
            setUploadProgress(100);
        }
    }

    async function loadPendingDocs() {
        console.log("[ProcessV2] loadPendingDocs called. Project:", project);
        setBusy(true);
        try {
            const res = await api.get(`/api/corev2/docs?project=${project}&status=staging&limit=200`);
            const extRes = await api.get(`/api/corev2/docs?project=${project}&status=extracted&limit=200`);
            const uploadRes = await api.get(`/api/corev2/docs?project=${project}&status=uploaded&limit=200`);

            const allPending = [
                ...(res.data.rows || []),
                ...(extRes.data.rows || []),
                ...(uploadRes.data.rows || [])
            ];

            if (allPending.length === 0) {
                alert("Não foram encontrados documentos pendentes para este projeto.");
                return;
            }

            const fmtRows = allPending.map(r => ({
                ...r,
                total: r.total ? parseFloat(parseFloat(String(r.total).replace(',', '.')) || 0).toFixed(2) : r.total
            }));
            setRows(fmtRows);
            setBatchId('recovered-' + Date.now()); // Fake batchId to bypass the empty state
        } catch (e) {
            alert('Erro ao carregar pendentes: ' + e.message);
        } finally {
            setBusy(false);
        }
    }

    // -- Polling (Recursive Timeout for safety) --
    useEffect(() => {
        if (!batchId) return;
        let isMounted = true;
        let timer = null;

        const poll = async () => {
            if (String(batchId).startsWith('recovered-')) return;
            try {
                // 1. Get Progress
                const pRes = await api.get(`/api/progress/${batchId}?project=${project}`);
                const p = pRes.data;
                if (isMounted) {
                    setProcessingStats({ done: p.done, total: p.total, errors: p.errors });
                    const percent = Math.round(((p.done + p.errors) / p.total) * 100);
                    setProcessingProgress(percent);

                    // 2. Get Rows
                    const rowsRes = await api.get(`/api/batch/${batchId}?project=${project}`);
                    if (rowsRes.data.rows && isMounted) {
                        const fmtRows = rowsRes.data.rows.map(r => ({
                            ...r,
                            total: r.total ? parseFloat(parseFloat(String(r.total).replace(',', '.')) || 0).toFixed(2) : r.total
                        }));
                        setRows(fmtRows);
                        // Auto-clear files to hide the "Processar (X)" button once results start appearing
                        if (fmtRows.length > 0) setFiles([]);
                    }

                    // Check finish
                    if (percent >= 100) {
                        setIsUploading(false);
                        // Ensure batchId is eventually cleared only when results are stable
                        // but don't clear it immediately if we want to keep the "Review Batch" view
                    } else {
                        // Schedule next
                        timer = setTimeout(poll, 1000);
                    }
                }
            } catch (e) {
                // Stop polling if 404 (Zombie Batch) - Silent handling
                if (e.response && e.response.status === 404) {
                    if (isMounted) {
                        console.warn(`[Poll] Batch ${batchId} not found, stopping.`);
                        setBatchId(null);
                        setIsUploading(false);
                    }
                } else if (isMounted) {
                    console.error("Poll error", e);
                    // Retry for other errors
                    timer = setTimeout(poll, 2000);
                }
            }
        };

        poll();

        return () => {
            isMounted = false;
            if (timer) clearTimeout(timer);
        };
    }, [batchId]);


    const updateRow = async (id, field, value) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
        try {
            await api.patch(`/api/corev2/docs/${id}?project=${project}`, { [field]: value });
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    };

    const handleReprocess = async (rowId) => {
        if (!confirm("Reprocessar este documento? Todos os campos serão extraídos novamente.")) return;
        setBusy(true);
        try {
            const res = await api.post(qp(`/api/reprocess/${rowId}`, project));
            const fresh = res.data;
            // Update rows
            setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...fresh } : r));
            // If active, update activeReviewRow too
            if (activeReviewRow && activeReviewRow.id === rowId) {
                setActiveReviewRow(prev => ({ ...prev, ...fresh }));
            }
            alert("Reprocessamento concluído com sucesso.");
        } catch (e) {
            alert("Erro ao reprocessar: " + e.message);
        } finally {
            setBusy(false);
        }
    };

    const deleteRow = async (id) => {
        if (!confirm(t('process.actions.delete') + '?')) return;
        try {
            await api.delete(`/api/corev2/docs/${id}?project=${project}`);
            setRows(prev => prev.filter(r => r.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } catch (e) { alert(e.message); }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`${t('process.actions.delete')} (${selectedIds.size})?`)) return;

        // Naive bulk delete (loop) - ideally implement bulk delete API
        setBusy(true);
        try {
            for (const id of selectedIds) {
                await api.delete(`/api/corev2/docs/${id}?project=${project}`);
            }
            setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
            setSelectedIds(new Set());
        } catch (e) { alert(e.message) }
        finally { setBusy(false); }
    }

    const finalize = async () => {
        const targetRows = selectedIds.size > 0 ? rows.filter(r => selectedIds.has(r.id)) : rows;
        if (!targetRows.length) return;

        const count = targetRows.length;
        if (!confirm(`${t('process.actions.finalize')} (${count})?`)) return;

        const items = targetRows.map(r => ({ id: r.id, docType: r.docType, docNumber: r.docNumber }));
        await performFinalize({ items });
    };

    const finalizeRow = async (row) => {
        if (!confirm(`${t('process.actions.finalize')} ${row.docNumber}?`)) return;
        const items = [{ id: row.id, docType: row.docType, docNumber: row.docNumber }];
        await performFinalize({ items });
    };

    const performFinalize = async (payload, force = false) => {
        setBusy(true);
        setIsFinalizing(true);
        setFinalizeProgress(10); // Start
        try {
            const finalPayload = { ...payload, force };

            // Simular progresso enquanto a API processa
            const progressInterval = setInterval(() => {
                setFinalizeProgress(prev => (prev < 90 ? prev + 5 : prev));
            }, 500);

            // Pequeno atraso para garantir que o utilizador vê a mensagem (UX)
            await new Promise(r => setTimeout(r, 800));

            const res = await api.post(qp('/api/corev2/docs/finalize-bulk', project), finalPayload);

            clearInterval(progressInterval);
            setFinalizeProgress(100);

            if (res.data.conflict) {
                setConflictState({ ...res.data.conflicts[0], payload: finalPayload });
                return;
            }

            // Remove finalized from view
            const results = res.data.results || [];
            const finalizedIds = new Set(results.filter(r => r.ok).map(r => r.id));
            const failedCount = results.filter(r => !r.ok).length;

            setRows(prev => prev.filter(r => !finalizedIds.has(r.id)));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                finalizedIds.forEach(id => newSet.delete(id));
                return newSet;
            });
            setActiveReviewRow(null);

            if (rows.length === 1 && finalizedIds.has(rows[0].id)) {
                setFiles([]);
                setBatchId(null);
            }

            if (failedCount > 0) {
                const errors = results.filter(r => !r.ok).map(r => r.error).join('\n');
                alert(`Concluído com avisos:\n${finalizedIds.size} guardados.\n${failedCount} falharam:\n${errors}`);
            } else {
                // alert("Sucesso! Documentos guardados.");
            }
        } catch (e) {
            alert("Erro ao finalizar: " + e.message);
        } finally {
            setBusy(false);
            setIsFinalizing(false);
            setFinalizeProgress(0);
        }
    };

    // -- Selection Logic --
    const toggleSelection = (id) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === rows.length && rows.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(rows.map(r => r.id)));
        }
    };


    const viewRowPdf = (row) => {
        api.get(`/api/corev2/docs/${row.id}/view?project=${project}`, { responseType: 'blob' })
            .then(res => {
                const url = URL.createObjectURL(res.data);
                setActiveReviewRow({ ...row, pdfUrl: url });
            })
            .catch(e => alert("Erro ao abrir PDF: " + e.message));
    };

    // -- Drag & Drop Logic --
    const handleDragStart = (e, id, field, value) => {
        setDragSrc({ id, field, value });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, field, value }));
    };

    const handleDrop = async (e, targetId, targetField, targetValue) => {
        e.preventDefault();
        if (!dragSrc) return;
        if (dragSrc.id === targetId && dragSrc.field === targetField) return;

        if (targetValue && String(targetValue).trim() !== '') {
            setDragModal({
                src: dragSrc,
                target: { id: targetId, field: targetField, value: targetValue }
            });
            return;
        }
        await performMove(dragSrc, { id: targetId, field: targetField });
        setDragSrc(null);
    };

    // -- Teaching State --
    const [teachingState, setTeachingState] = useState(null); // { profileId, file }

    const handleTeach = async (row) => {
        try {
            // 1. Get File
            const res = await api.get(`/api/corev2/docs/${row.id}/view?project=${project}`, { responseType: 'blob' });
            const file = new File([res.data], "document.pdf", { type: 'application/pdf' });

            // 2. Resolve Profile
            let profileId = row._profile?.id;
            if (!profileId) {
                // Create new profile flow
                const name = prompt("Este documento não tem perfil. Nome do novo perfil:");
                if (!name) return;
                const pRes = await api.post('/api/extraction/profiles', {
                    name,
                    doc_type: row.docType || 'invoice',
                    priority: 5
                });
                profileId = pRes.data.id;
            }

            setTeachingState({ profileId, file });
        } catch (err) {
            alert("Erro ao iniciar ensino: " + err.message);
        }
    };

    const performMove = async (src, target) => {
        await updateRow(target.id, target.field, src.value);
        await updateRow(src.id, src.field, '');
    };
    const performSwap = async (src, target) => {
        await updateRow(target.id, target.field, src.value);
        await updateRow(src.id, src.field, target.value);
    };
    const performReplace = async (src, target) => {
        await performMove(src, target);
    };


    return (
        <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar relative">
            {/* Banner de Gravação (Visual Feedback) */}
            {isFinalizing && createPortal(
                <div className="fixed top-0 left-0 right-0 z-[10000] bg-[var(--accent-primary)]/95 backdrop-blur-md text-white p-4 shadow-2xl animate-in slide-in-from-top duration-300 flex flex-col gap-2 border-b border-white/20">
                    <div className="flex items-center justify-center gap-3 font-bold text-lg">
                        <span className="animate-spin">💾</span>
                        <span>{t('process.alerts.saving') || 'Guardando documento(s)... Por favor, aguarde.'}</span>
                    </div>
                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden max-w-2xl mx-auto border border-white/10">
                        <div
                            className="h-full bg-white transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                            style={{ width: `${finalizeProgress}%` }}
                        />
                    </div>
                </div>, document.body
            )}

            {/* MARKER */}
            <div className="fixed top-2 right-2 opacity-50 text-[10px] pointer-events-none z-[9999]">PROCESSAR_V2_MARKER</div>

            {/* Modal: Drag Conflict */}
            {dragModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
                        <h3 className="text-lg font-bold mb-2">{t('process.modal.drag_title')}</h3>
                        <p className="opacity-75 mb-6">{t('process.modal.drag_msg')}</p>
                        <div className="text-sm bg-[var(--bg-base)] p-3 rounded mb-6 font-mono text-center truncate">
                            {dragModal.src.value} <span className="opacity-50">➔</span> {dragModal.target.value}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button className="btn" onClick={() => setDragModal(null)}>{t('process.actions.cancel')}</button>
                            <button className="btn" onClick={async () => {
                                await performSwap(dragModal.src, dragModal.target);
                                setDragModal(null); setDragSrc(null);
                            }}>
                                <IconArrowLeftRight /> {t('process.actions.swap')}
                            </button>
                            <button className="btn primary" onClick={async () => {
                                await performReplace(dragModal.src, dragModal.target);
                                setDragModal(null); setDragSrc(null);
                            }}>
                                {t('process.actions.replace')}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal: Specialized Viewer Overlay */}
            {activeReviewRow && (
                (() => {
                    const SpecializedViewer = getViewer(activeReviewRow);
                    if (SpecializedViewer) {
                        return (
                            <SpecializedViewer
                                doc={activeReviewRow}
                                onClose={() => setActiveReviewRow(null)}
                                updateRow={updateRow}
                                onFinalize={() => finalizeRow(activeReviewRow)}
                                mode="staging"
                                t={t}
                            />
                        );
                    }
                    return (
                        <SplitScreenOverlay
                            title={`Validação Nicolazzi (${activeReviewRow.docType?.toUpperCase() || 'DOC'}): ${activeReviewRow.docNumber || '---'}`}
                            pdfUrl={activeReviewRow.pdfUrl}
                            onClose={() => setActiveReviewRow(null)}
                            onReprocess={() => handleReprocess(activeReviewRow.id)}
                        >
                            <div className="flex flex-col items-center justify-center h-full p-12 text-center opacity-50 italic">
                                <span>No specialized viewer mapping found for this document type.</span>
                            </div>
                        </SplitScreenOverlay>
                    );
                })()
            )}

            {/* Modal: Conflict Resolution (Phase 8) */}
            {conflictState && createPortal(
                <ConflictModal
                    conflict={conflictState}
                    onCancel={() => setConflictState(null)}
                    onConfirm={async (force) => {
                        const payload = conflictState.payload;
                        setConflictState(null);
                        await performFinalize(payload, force);
                    }}
                />, document.body
            )}

            {/* Modal: Teaching (Profile Editor) */}
            {teachingState && createPortal(
                <ProfileEditor
                    profileId={teachingState.profileId}
                    initialFile={teachingState.file}
                    onClose={() => setTeachingState(null)}
                />, document.body
            )}

            {/* 1. Header & Project Actions */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{t('process.title')}</h1>
                    <div className="text-sm opacity-50">{t('sidebar.workspace')}: {project}</div>
                    {project === 'default' && <div className="text-xs text-red-500 font-bold animate-pulse">⚠️ SYSTEM DEFAULT</div>}
                </div>
                {console.log('[ProcessV2Tab] Rendered with project:', project)}
            </div>

            {/* 2. Upload Area */}
            {rows.length === 0 && !isUploading && (
                <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10' : 'border-[var(--border)] hover:border-[var(--text-muted)]'}`}>
                    <input {...getInputProps()} />
                    <div className="text-4xl mb-4">📄</div>
                    <div className="text-lg font-medium mb-2">{t('process.dropzone')}</div>
                    <div className="text-sm opacity-50">.PDF (Multiple)</div>

                    <div className="mt-6 flex flex-col gap-3 w-full max-w-md">
                        {files.length > 0 && (
                            <button onClick={(e) => { e.stopPropagation(); startProcessing(); }} className="btn primary w-full">{t('process.btn_process')} ({files.length})</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); loadPendingDocs(); }} className="btn w-full bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
                            🔁 Recuperar Documentos Pendentes
                        </button>
                    </div>
                </div>
            )}

            {/* 3. Progress Bars */}
            {(isUploading || processingProgress > 0) && (
                <GlassCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <div className="flex justify-between text-xs uppercase font-bold tracking-widest mb-2 opacity-75">{t('process.uploading')} <span>{uploadProgress}%</span></div>
                            <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs uppercase font-bold tracking-widest mb-2 opacity-75">{t('process.processing')} <span>{processingStats.done}/{processingStats.total}</span></div>
                            <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden"><div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${processingProgress}%` }} /></div>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* 4. Review Table */}
            {rows.length > 0 && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-bold">Review Batch ({rows.length})</div>
                        <div className="flex gap-2">
                            {/* Show "Delete Selected" if > 0 */}
                            {selectedIds.size > 0 && (
                                <button className="btn text-[var(--err)]" onClick={deleteSelected}>
                                    <IconTrash /> {t('process.actions.delete')} ({selectedIds.size})
                                </button>
                            )}

                            <button className="btn text-xs" onClick={() => setShowAdditional(!showAdditional)}>{showAdditional ? 'Hide Extra' : 'Show Extra'}</button>
                            <button className="btn primary" onClick={finalize}>
                                {t('process.actions.finalize')}
                                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ' All'}
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-[var(--bg-base)] text-[var(--text-muted)] font-bold">
                                <tr>
                                    {/* Select All Checkbox */}
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={rows.length > 0 && selectedIds.size === rows.length}
                                            onChange={toggleSelectAll}
                                            className="cursor-pointer"
                                        />
                                    </th>
                                    <th className="p-3 w-10">#</th>
                                    <th className="p-3">{t('process.table.type')}</th>
                                    <th className="p-3">{t('process.table.doc_no')}</th>
                                    <th className="p-3">{t('process.table.date')}</th>
                                    <th className="p-3">Customer</th>
                                    <th className="p-3">{t('process.table.total')}</th>
                                    <th className="p-3">{t('process.table.supplier')}</th>
                                    {showAdditional && <th className="p-3">Notes</th>}
                                    <th className="p-3 w-20">{t('process.table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map((row, i) => (
                                    <Row
                                        key={row.id}
                                        index={i}
                                        row={row}
                                        updateRow={updateRow}
                                        deleteRow={deleteRow}
                                        viewRowPdf={viewRowPdf}
                                        showAdditional={showAdditional}
                                        t={t}
                                        handleDragStart={handleDragStart}
                                        handleDrop={handleDrop}
                                        isSelected={selectedIds.has(row.id)}
                                        toggleSelection={toggleSelection}
                                        availableTypes={availableTypes}
                                        processCreateType={createType}
                                        handleTeach={handleTeach}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component
function Row({ index, row, updateRow, deleteRow, viewRowPdf, showAdditional, t, handleDragStart, handleDrop, isSelected, toggleSelection, availableTypes = [], processCreateType, handleTeach }) {

    // Helper Props for DInput
    const dInputProps = {
        rowId: row.id, updateRow, handleDragStart, handleDrop
    }

    const currentType = normalizeDocType(row.docType, availableTypes);

    return (
        <tr className={`hover:bg-[var(--surface-hover)] transition-colors ${isSelected ? 'bg-blue-500/10' : ''}`}>
            <td className="p-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(row.id)}
                    className="cursor-pointer"
                />
            </td>
            <td className="p-3 opacity-50 font-mono text-xs">{index + 1}</td>
            <td className="p-3">
                <select
                    className="bg-transparent w-full outline-none focus:text-[var(--accent-primary)] font-medium appearance-none cursor-pointer"
                    value={currentType}
                    onChange={async (e) => {
                        const val = e.target.value;
                        if (val === '__NEW__') {
                            const label = prompt("Nome do novo tipo de documento:");
                            if (label) {
                                const newType = await processCreateType(label); // Passed from parent
                                if (newType) {
                                    updateRow(row.id, 'docType', newType.slug);
                                }
                            }
                        } else {
                            updateRow(row.id, 'docType', val);
                        }
                    }}
                >
                    {availableTypes.map(t => (
                        <option key={t.slug || t.id} value={t.slug || t.id}>{t.label || t.labelPt || t.slug || t.id}</option>
                    ))}
                    <option value="other">Outro</option>
                    <option disabled>──────────</option>
                    <option value="__NEW__">+ Criar Novo...</option>
                </select>
            </td>
            <td className="p-3"><DInput {...dInputProps} field="docNumber" value={row.docNumber} className={!row.docNumber ? 'border-b border-red-500/50' : 'focus:scale-105'} /></td>
            <td className="p-3"><DInput {...dInputProps} field="date" value={row.date} className="w-24" /></td>
            <td className="p-3"><DInput {...dInputProps} field="customer" value={row.customer} className="font-medium" /></td>

            {/* Total with Euro Format */}
            <td className="p-3 font-mono">
                <DInput
                    {...dInputProps}
                    field="total"
                    value={row.total}
                    className="w-20 text-right"
                    prefix="€"
                    onBlur={(e) => {
                        const v = parseFloat(e.target.value.replace(',', '.')); // Handle decimal comma
                        if (!isNaN(v)) {
                            updateRow(row.id, 'total', parseFloat(v || 0).toFixed(2));
                        }
                    }}
                />
            </td>

            <td className="p-3"><DInput {...dInputProps} field="supplier" value={row.supplier} className="opacity-80" /></td>
            {showAdditional && <td className="p-3"><DInput {...dInputProps} field="notes" value={row.notes} className="opacity-50" /></td>}
            <td className="p-3 flex gap-2 justify-end items-center">
                {row._profile && (
                    <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20 mr-2" title={"Profile: " + row._profile.name}>
                        {row._profile.name}
                    </span>
                )}
                <button className="text-[var(--text-muted)] hover:text-blue-400 transition-colors p-1" onClick={() => handleTeach(row)} title="Ensinar (Criar Regra)"><IconBrain /></button>
                <button className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors p-1" onClick={() => viewRowPdf(row)} title={t('process.actions.view')}><IconEye /></button>
                <button className="text-[var(--err)] opacity-50 hover:opacity-100 transition-colors p-1" onClick={() => deleteRow(row.id)} title={t('process.actions.delete')}><IconTrash /></button>
            </td>
        </tr>
    )
}

function ConflictModal({ conflict, onCancel, onConfirm }) {
    const existing = conflict.existing[0]; // Simplified for now
    const pending = conflict.pending || conflict; // Support both old and new backend responses

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-2xl max-w-2xl w-full mx-4 overflow-hidden flex flex-col gap-6">
                <div>
                    <h2 className="text-xl font-bold text-[var(--err)] flex items-center gap-2">
                        ⚠️ Conflito de Documento
                    </h2>
                    <p className="opacity-70 mt-1">Este documento já existe no arquivo definitivo. Por favor compare as versões.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Existing Version */}
                    <div className="bg-[var(--bg-base)] p-5 rounded-xl border border-[var(--border)] relative overflow-hidden">
                        <div className="text-[10px] uppercase opacity-30 font-bold absolute top-2 right-3">Arquivo Final</div>
                        <div className="text-xs uppercase opacity-50 font-bold mb-3 border-b border-[var(--border)] pb-2">Versão no Sistema</div>
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Fornecedor / Entidade</span>
                                <span className="text-sm font-bold truncate" title={existing.supplier}>{existing.supplier || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Número / Data</span>
                                <span className="text-sm font-bold">{existing.docNumber} <span className="opacity-50">|</span> {existing.date || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Cliente / Ref</span>
                                <span className="text-sm font-bold truncate" title={existing.customer}>{existing.customer || 'N/A'}</span>
                            </div>
                            <div className="bg-black/20 p-2 rounded mt-2">
                                <span className="text-[10px] opacity-50 uppercase block">Total</span>
                                <span className="text-xl font-mono text-white">€{parseFloat(existing.total || 0).toFixed(2)}</span>
                            </div>
                            <span className="text-[10px] opacity-40 mt-1">Gravado em: {new Date(existing.created_at).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Pending Version */}
                    <div className="bg-blue-500/10 p-5 rounded-xl border border-blue-500/30 relative overflow-hidden">
                        <div className="text-[10px] uppercase text-blue-400 font-bold absolute top-2 right-3 italic">Documento Atual</div>
                        <div className="text-xs uppercase text-blue-400 font-bold mb-3 border-b border-blue-500/20 pb-2">Sua Versão (Edição)</div>
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Fornecedor / Entidade</span>
                                <span className="text-sm font-bold text-blue-300 truncate" title={pending.supplier}>{pending.supplier || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Número / Data</span>
                                <span className="text-sm font-bold text-blue-300">{pending.docNumber} <span className="opacity-50">|</span> {pending.date || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] opacity-50 uppercase">Cliente / Ref</span>
                                <span className="text-sm font-bold text-blue-300 truncate" title={pending.customer}>{pending.customer || 'N/A'}</span>
                            </div>
                            <div className="bg-blue-500/20 p-2 rounded mt-2">
                                <span className="text-[10px] opacity-50 uppercase block">Total</span>
                                <span className="text-xl font-mono text-blue-400">€{parseFloat(pending.total || 0).toFixed(2)}</span>
                            </div>
                            <span className="text-[10px] opacity-40 mt-1">Status: Pendente de Validação</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20 text-xs italic">
                    <span>ℹ️ Se confirmar, a versão antiga será guardada num backup por 15 dias.</span>
                </div>

                <div className="flex gap-3 justify-end mt-4">
                    <button className="btn px-6 border-none bg-gray-500/20 hover:bg-gray-500/40" onClick={onCancel}>Manter Arquivado</button>
                    <button className="btn primary px-6 bg-[var(--err)] hover:bg-red-600 border-none shadow-lg shadow-red-900/20" onClick={() => onConfirm(true)}>
                        Substituir e Backup
                    </button>
                </div>
            </div>
        </div>
    );
}
