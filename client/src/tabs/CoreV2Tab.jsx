import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { fmtEUR, Badge } from '../shared/ui';
import api from '../api/apiClient';

export default function CoreV2Tab({ project }) {
    const [rows, setRows] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState({});

    const [docTypes, setDocTypes] = useState([]);
    const [suggestionsDoc, setSuggestionsDoc] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);

    // Selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDocType, setBulkDocType] = useState('');

    // Transaction Modal
    const [showTxModal, setShowTxModal] = useState(false);
    const [txTitle, setTxTitle] = useState('');

    // Draft edits (ID mapping)
    const [drafts, setDrafts] = useState({});
    // 1. Load Docs & Config
    async function load() {
        try {
            const [resDocs, resTypes] = await Promise.all([
                api.get(`/api/v2/docs?project=${project}`),
                api.get(`/api/v2/doctypes?project=${project}`).catch(() => ({ data: { types: [] } }))
            ]);
            const sorted = (resDocs.data.rows || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setRows(sorted);
            const rawTypes = resTypes.data;
            const list = Array.isArray(rawTypes) ? rawTypes :
                Array.isArray(rawTypes.types) ? rawTypes.types :
                    Array.isArray(rawTypes.items) ? rawTypes.items : [];
            setDocTypes(list);
        } catch (e) {
            console.error(e);
            alert('Error loading docs: ' + e.message);
        }
    }

    useEffect(() => { load(); }, [project]);

    // Selection Logic
    function toggleSelect(id) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    }

    function toggleSelectAll() {
        if (selectedIds.size === rows.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(rows.map(r => r.id)));
    }

    async function applyBulkDocType() {
        if (!bulkDocType) return alert('Select a type first');
        if (!confirm(`Apply ${bulkDocType} to ${selectedIds.size} docs?`)) return;

        try {
            // Find canonical label
            const foundOption = docTypes.find(t => (t.id === bulkDocType) || (t === bulkDocType));
            const labelPt = (typeof foundOption === 'object') ? foundOption.labelPt : bulkDocType;

            await api.post(`/api/v2/docs/bulk?project=${project}`, {
                ids: Array.from(selectedIds),
                patch: {
                    docTypeId: typeof foundOption === 'object' ? foundOption.id : null,
                    docTypeLabel: labelPt,
                    docType: labelPt // Legacy/Fallback field update
                }
            });
            setSelectedIds(new Set()); // clear selection
            setBulkDocType('');
            load();
        } catch (e) { alert('Bulk error: ' + e.message); }
    }

    // Open Modal and Pre-fill Smart Title
    useEffect(() => {
        if (showTxModal && selectedIds.size > 0 && !txTitle) {
            // Smart Title Heuristic
            const selectedDocs = rows.filter(r => selectedIds.has(r.id));
            if (selectedDocs.length > 0) {
                const mainDoc = selectedDocs[0];
                const entity = mainDoc.customer || mainDoc.supplier || 'Transação';
                const ref = mainDoc.docNumber || mainDoc.date || new Date().toISOString().split('T')[0];
                setTxTitle(`${entity} - ${ref}`);
            }
        }
    }, [showTxModal, selectedIds]);

    async function createTransactionFromSelection() {
        if (selectedIds.size === 0) return;
        const titleToUse = txTitle || `Transação ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

        try {
            // 1. Create Tx
            const res = await api.post(`/api/v2/transactions?project=${project}`, { title: titleToUse });
            const txId = res.data.transaction.id;

            // 2. Add Docs
            const docIds = Array.from(selectedIds);
            await api.post(`/api/v2/transactions/${txId}/add-docs?project=${project}`, { docIds });

            alert('Transaction Created!');
            setShowTxModal(false);
            setTxTitle('');
            setSelectedIds(new Set());
        } catch (e) { alert('Error creating transaction: ' + e.message); }
    }

    // Suggestions
    async function showSuggestions(r) {
        setSuggestionsDoc(r);
        setSuggestionsLoading(true);
        try {
            const res = await api.get(`/api/v2/docs/${r.id}/link-suggestions?project=${project}`);
            setSuggestions(res.data.candidates || []);
        } catch (e) { alert('Error fetching suggestions'); }
        finally { setSuggestionsLoading(false); }
    }

    async function linkDocs(targetId) {
        try {
            await api.post(`/api/v2/links?project=${project}`, { fromId: suggestionsDoc.id, toId: targetId });
            alert('Linked successfully!');
            setSuggestionsDoc(null);
        } catch (e) { alert('Link error: ' + e.message); }
    }

    // 2. Upload
    const onDrop = async (files) => {
        setUploading(true);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            // axios (api) automatically sets Content-Type for FormData
            const res = await api.post(`/api/v2/upload?project=${project}`, fd);

            // Auto-trigger extract
            const newIds = res.data.docs.map(d => d.id);
            await extract(newIds);

        } catch (e) {
            alert('Upload failed: ' + e.message);
        } finally {
            setUploading(false);
            load();
        }
    };
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });

    // 3. Extract
    async function extract(ids) {
        if (!ids.length) return;
        setProcessing(true);
        try {
            await api.post(`/api/v2/extract?project=${project}`, { docIds: ids });
            // We don't need to alert, just reload table to show extracted data
        } catch (e) {
            alert('Extraction error: ' + e.message);
        } finally {
            setProcessing(false);
            load();
        }
    }

    // 4. Inline Edit
    function startEdit(r) { setEditing(r.id); setDraft(r); }
    function cancelEdit() { setEditing(null); setDraft({}); }
    async function saveEdit() {
        try {
            await api.patch(`/api/v2/docs/${editing}?project=${project}`, draft);
            setEditing(null);
            load();
        } catch (e) { alert('Save error: ' + e.message); }
    }

    async function updateDocType(id, val) {
        try {
            // If val corresponds to a rich type, send rich data
            const foundOption = docTypes.find(t => (t.id === val) || (t === val));
            const patch = {};
            if (typeof foundOption === 'object') {
                patch.docTypeId = foundOption.id;
                patch.docTypeLabel = foundOption.labelPt;
                patch.docType = foundOption.labelPt; // Sync legacy
            } else {
                patch.docType = val;
            }

            await api.patch(`/api/v2/docs/${id}?project=${project}`, patch);
            load(); // Reload to refresh state
        } catch (e) { alert('Error updating type: ' + e.message); }
    }

    // 5. Finalize
    async function finalize(r) {
        // TEMP LOGGING per User Request
        console.debug('[Finalize] object:', r);
        console.debug('[Finalize] validation check:', {
            docType: r.docType,
            docNumber: r.docNumber,
            docTypeLabel: r.docTypeLabel,
            docTypeId: r.docTypeId
        });

        // Robust Validation Fix
        const hasType = r.docType || r.docTypeLabel || r.docTypeId;
        const hasNumber = r.docNumber && String(r.docNumber).trim().length > 0;

        if (!hasType || !hasNumber) {
            let missing = [];
            if (!hasType) missing.push("Tipo do documento");
            if (!hasNumber) missing.push("Nº do documento");
            return alert(`Impossível finalizar.\nFalta: ${missing.join(', ')}`);
        }

        if (!confirm('Finalizar e Arquivar documento?')) return;

        try {
            await api.post(`/api/v2/docs/finalize?project=${project}`, { ...r });
            load();
        } catch (e) { alert('Finalize error: ' + (e.response?.data?.error || e.message)); }
    }

    // 6. Export
    async function exportXlsx() {
        try {
            const res = await api.post(`/api/v2/export.xlsx?project=${project}`, {}, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `core_v2_export.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) { alert('Export failed'); }
    }

    return (
        <div className="v2-container">
            <div className="card mb-4" {...getRootProps()} style={{ border: '2px dashed var(--border)', textAlign: 'center', padding: 40, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>
                <input {...getInputProps()} />
                {uploading ? <p>Uploading & Extracting...</p> : <p>{isDragActive ? 'Drop files here' : 'Drag & drop PDFs here to Start (V2 Flow)'}</p>}
            </div>

            <div className="card">
                <div className="row mb-2">
                    <div className="card__title">Staging / Review</div>
                    <div style={{ marginLeft: 'auto' }}>
                        {processing && <span className="muted mr-2">Processing...</span>}
                        <button className="btn" onClick={load}>Refresh</button>
                        <button className="btn primary" onClick={exportXlsx}>Export All XLSX</button>
                    </div>
                </div>


                {selectedIds.size > 0 && (
                    <div className="row mb-2 p-2 bg-light" style={{ alignItems: 'center', gap: 10 }}>
                        <span>{selectedIds.size} selected</span>
                        <select className="input" style={{ width: 200 }} value={bulkDocType} onChange={e => setBulkDocType(e.target.value)}>
                            <option value="">Apply DocType...</option>
                            {docTypes.map(t => {
                                const val = typeof t === 'object' ? t.id : t;
                                const lab = typeof t === 'object' ? t.labelPt : t;
                                return <option key={val} value={val}>{lab}</option>
                            })}
                        </select>
                        <button className="btn btn--tiny primary" onClick={applyBulkDocType}>Apply</button>
                        <div style={{ width: 1, height: 20, background: '#ccc', margin: '0 10px' }}></div>
                        <button className="btn btn--tiny" onClick={() => setShowTxModal(true)}>📂 Create Transaction</button>
                    </div>
                )}

                {/* Transaction Creation Modal */}
                {showTxModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div className="card" style={{ width: 500, padding: 20, background: 'var(--bg-card)' }}>
                            <h3>Create Transaction</h3>
                            <p className="text-muted mb-4">Create a new case for the {selectedIds.size} selected documents.</p>

                            <div className="mb-4" style={{ maxHeight: 150, overflowY: 'auto', background: 'var(--bg-main)', padding: 10, borderRadius: 4 }}>
                                {rows.filter(r => selectedIds.has(r.id)).map(r => (
                                    <div key={r.id} style={{ fontSize: '0.85em', borderBottom: '1px solid #eee', padding: 4 }}>
                                        <strong>{r.docTypeLabel || r.docType || 'Doc'}</strong> {r.docNumber}
                                        {r.supplier && <span className="text-muted ml-2">({r.supplier})</span>}
                                        {r.total > 0 && <span className="ml-2" style={{ float: 'right' }}>{r.total}€</span>}
                                    </div>
                                ))}
                            </div>

                            <label style={{ display: 'block', marginBottom: 5 }}>Title</label>
                            <input
                                className="input"
                                style={{ width: '100%' }}
                                placeholder="e.g. Order 123 - Supplier X"
                                value={txTitle}
                                onChange={e => setTxTitle(e.target.value)}
                            />

                            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button className="btn" onClick={() => { setShowTxModal(false); setTxTitle(''); }}>Cancel</button>
                                <button className="btn primary" onClick={createTransactionFromSelection}>Create</button>
                            </div>
                        </div>
                    </div>
                )}

                <table className="table">
                    <thead>
                        <tr>
                            <th style={{ width: 30 }}><input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleSelectAll} /></th>
                            {/* Updated Headers for Clarity */}
                            <th>Status/Info</th>
                            <th>File</th>
                            <th>Type (PT)</th>
                            <th>Number</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Total</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => {
                            const isEdit = editing === r.id;
                            // Ensure docTypes loaded
                            const docTypeOpts = docTypes || ['Fatura', 'Fatura-Recibo', 'Nota de Crédito'];

                            // Value for Select
                            const currentVal = r.docTypeId || r.docType || '';

                            return (
                                <tr key={r.id} className={r.needsReview ? 'row-warning' : ''}>
                                    <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>

                                    <td>
                                        <Badge>{r.status}</Badge>
                                        {r.extractionMethod === 'ai' && <small className="text-muted ml-1">AI</small>}
                                        {r.needsReview && <span className="tag warning ml-1" title="Review Required">⚠</span>}
                                        {r.needsReviewDocType && <span className="tag warning ml-1" title="Check Type">Type?</span>}
                                    </td>
                                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.origName}>{r.origName}</td>

                                    <td>
                                        {(!isEdit && !r.needsReviewDocType && r.docTypeLabel) ? (
                                            <span
                                                title="Click to edit type"
                                                style={{ cursor: 'pointer', borderBottom: '1px dashed #ccc' }}
                                                onClick={() => startEdit(r)}
                                            >
                                                {r.docTypeLabel}
                                            </span>
                                        ) : (
                                            <select
                                                className="input"
                                                value={isEdit ? (draft.docTypeId || draft.docType || '') : (r.docTypeId || r.docType || '')}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (isEdit) {
                                                        const found = docTypeOpts.find(t => (typeof t === 'object' ? t.id : t) === val);
                                                        setDraft(d => ({
                                                            ...d,
                                                            docTypeId: val,
                                                            docType: typeof found === 'object' ? found.labelPt : val
                                                        }));
                                                    } else {
                                                        updateDocType(r.id, val);
                                                    }
                                                }}
                                                style={r.needsReviewDocType ? { border: '1px solid orange' } : {}}
                                                disabled={!docTypeOpts.length}
                                                title={r.docTypeRaw ? `Raw: ${r.docTypeRaw}` : ''}
                                            >
                                                {(!currentVal || !docTypeOpts.find(t => (typeof t === 'object' ? t.id : t) === currentVal)) &&
                                                    <option value={currentVal}>{r.docTypeLabel || currentVal || '(Sem Tipo)'}</option>
                                                }
                                                <option value="">(Select)</option>
                                                {docTypeOpts.map(t => {
                                                    const val = typeof t === 'object' ? (t.code || t.value || t.id) : t;
                                                    const lab = typeof t === 'object' ? (t.label || t.name || t.labelPt || val) : t;
                                                    return <option key={val} value={val}>{lab}</option>
                                                })}
                                            </select>
                                        )}
                                    </td>
                                    <td>{isEdit ? <input className="input" value={draft.docNumber || ''} onChange={e => setDraft(d => ({ ...d, docNumber: e.target.value }))} /> : r.docNumber}</td>
                                    <td>{isEdit ? <input type="date" className="input" value={draft.date || ''} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /> : r.date}</td>
                                    <td>{isEdit ? <input className="input" value={draft.customer || ''} onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))} /> : (r.customer || '-')}</td>
                                    <td>{isEdit ? <input className="input" value={draft.total || ''} onChange={e => setDraft(d => ({ ...d, total: e.target.value }))} /> : fmtEUR(r.total)}</td>

                                    <td>
                                        {isEdit ? (
                                            <>
                                                <button className="btn btn--tiny primary" onClick={saveEdit}>Save</button>
                                                <button className="btn btn--tiny" onClick={cancelEdit}>Cancel</button>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn--tiny" onClick={() => startEdit(r)}>Edit</button>
                                                <button className="btn btn--tiny" onClick={() => showSuggestions(r)} title="Link Docs">🔗</button>
                                                {r.status !== 'processado' && <button className="btn btn--tiny success" onClick={() => finalize(r)}>Finalize</button>}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Suggestions Modal */}
            {suggestionsDoc && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>Link Suggestions for {suggestionsDoc.docNumber}</h3>
                        {suggestionsLoading ? <p>Loading...</p> : (
                            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                {suggestions.length === 0 ? <p>No suggestions found.</p> : (
                                    <table className="table">
                                        <thead><tr><th>Doc</th><th>Reason</th><th>Score</th><th>Action</th></tr></thead>
                                        <tbody>
                                            {suggestions.map(s => (
                                                <tr key={s.id}>
                                                    <td>{s.docNumber} <small>({fmtEUR(s.total)})</small></td>
                                                    <td>{s.reasons.join(', ')}</td>
                                                    <td>{s.score}</td>
                                                    <td><button className="btn btn--tiny" onClick={() => linkDocs(s.id)}>Link</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                        <div className="row mt-4" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setSuggestionsDoc(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
