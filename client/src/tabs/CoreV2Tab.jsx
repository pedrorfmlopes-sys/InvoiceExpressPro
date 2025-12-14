import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { fmtEUR, Badge } from '../shared/ui';
import api from '../api/apiClient';
import { debounce } from 'lodash'; // Need lodash or custom debounce? 
// Usually I'd use a custom hook or simple timeout. I'll use simple timeout.

export default function CoreV2Tab({ project }) {
    // Data State
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(false);

    // Filters
    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [docTypeFilter, setDocTypeFilter] = useState('');

    // Operations State
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState({});

    // Config & Metadata
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

    // Debounced Load
    const loadDebounced = useCallback((currPage, currQ, currStatus, currType) => {
        setLoading(true);
        api.get(`/api/v2/docs`, {
            params: {
                project,
                page: currPage,
                limit,
                q: currQ,
                status: currStatus,
                docType: currType
            }
        })
            .then(res => {
                setRows(res.data.rows || []);
                setTotal(res.data.total || 0);
            })
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [project, limit]); // limit changes -> reload?

    useEffect(() => {
        const handler = setTimeout(() => {
            loadDebounced(page, q, statusFilter, docTypeFilter);
        }, 300);
        return () => clearTimeout(handler);
    }, [page, q, statusFilter, docTypeFilter, loadDebounced]);

    // Initial Config Load
    useEffect(() => {
        api.get(`/api/v2/doctypes?project=${project}`)
            .then(res => {
                const rawTypes = res.data;
                const list = Array.isArray(rawTypes) ? rawTypes :
                    Array.isArray(rawTypes.types) ? rawTypes.types : [];
                setDocTypes(list);
            })
            .catch(() => { });
    }, [project]);

    function load() {
        // Immediate reload
        loadDebounced(page, q, statusFilter, docTypeFilter);
    }

    // Operations (Same as before, simplified)

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
            const foundOption = docTypes.find(t => (t.id === bulkDocType) || (t === bulkDocType));
            const labelPt = (typeof foundOption === 'object') ? foundOption.labelPt : bulkDocType;
            await api.post(`/api/v2/docs/bulk?project=${project}`, {
                ids: Array.from(selectedIds),
                patch: {
                    docTypeId: typeof foundOption === 'object' ? foundOption.id : null,
                    docTypeLabel: labelPt,
                    docType: labelPt
                }
            });
            setSelectedIds(new Set()); setBulkDocType(''); load();
        } catch (e) { alert('Bulk error: ' + e.message); }
    }

    // Modal Effect
    useEffect(() => {
        if (showTxModal && selectedIds.size > 0 && !txTitle) {
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
            const res = await api.post(`/api/v2/transactions?project=${project}`, { title: titleToUse });
            const txId = res.data.transaction.id;
            const docIds = Array.from(selectedIds);
            await api.post(`/api/v2/transactions/${txId}/add-docs?project=${project}`, { docIds });
            alert('Transaction Created!');
            setShowTxModal(false); setTxTitle(''); setSelectedIds(new Set());
        } catch (e) { alert('Error: ' + e.message); }
    }

    // Suggestions / Linking
    async function showSuggestions(r) {
        setSuggestionsDoc(r); setSuggestionsLoading(true);
        try {
            const res = await api.get(`/api/v2/docs/${r.id}/link-suggestions?project=${project}`);
            setSuggestions(res.data.candidates || []);
        } catch (e) { alert('Error suggestions'); } finally { setSuggestionsLoading(false); }
    }
    async function linkDocs(targetId) {
        try {
            await api.post(`/api/v2/links?project=${project}`, { fromId: suggestionsDoc.id, toId: targetId });
            alert('Linked'); setSuggestionsDoc(null);
        } catch (e) { alert('Error: ' + e.message); }
    }

    // Upload / Extract
    const onDrop = async (files) => {
        setUploading(true);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            const res = await api.post(`/api/v2/upload?project=${project}`, fd);
            await extract(res.data.docs.map(d => d.id));
        } catch (e) {
            alert('Upload failed: ' + e.message);
            setUploading(false); load();
        }
    };
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });

    async function extract(ids) {
        if (!ids.length) { setUploading(false); load(); return; } // catch-all
        setProcessing(true);
        try {
            await api.post(`/api/v2/extract?project=${project}`, { docIds: ids });
        } catch (e) { alert('Extract error: ' + e.message); }
        finally { setProcessing(false); setUploading(false); load(); }
    }

    // Inline Edit
    function startEdit(r) { setEditing(r.id); setDraft(r); }
    function cancelEdit() { setEditing(null); setDraft({}); }
    async function saveEdit() {
        try {
            await api.patch(`/api/v2/docs/${editing}?project=${project}`, draft);
            setEditing(null); load();
        } catch (e) { alert('Save error: ' + e.message); }
    }
    async function updateDocType(id, val) {
        try {
            const foundOption = docTypes.find(t => (t.id === val) || (t === val));
            const patch = {};
            if (typeof foundOption === 'object') {
                patch.docTypeId = foundOption.id;
                patch.docTypeLabel = foundOption.labelPt;
                patch.docType = foundOption.labelPt;
            } else { patch.docType = val; }
            await api.patch(`/api/v2/docs/${id}?project=${project}`, patch);
            load();
        } catch (e) { alert('Error: ' + e.message); }
    }

    async function finalize(r) {
        const hasType = r.docType || r.docTypeLabel || r.docTypeId;
        const hasNumber = r.docNumber && String(r.docNumber).trim().length > 0;
        if (!hasType || !hasNumber) return alert('Impossível finalizar. Falta Tipo ou Nº.');
        if (!confirm('Finalizar e Arquivar documento?')) return;
        try {
            await api.post(`/api/v2/docs/finalize?project=${project}`, { ...r });
            load();
        } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
    }

    async function exportXlsx() {
        try {
            const res = await api.post(`/api/v2/export.xlsx?project=${project}`, {}, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = `core_v2_export.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { alert('Export failed'); }
    }

    // --- UI ---
    const totalPages = Math.ceil(total / limit);

    return (
        <div className="v2-container">
            <div className="card mb-4" {...getRootProps()} style={{ border: '2px dashed var(--border)', textAlign: 'center', padding: 20, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>
                <input {...getInputProps()} />
                {uploading ? <p>Uploading & Extracting...</p> : <p>{isDragActive ? 'Drop files here' : 'Drag & drop PDFs here to Start (V2 Flow)'}</p>}
            </div>

            <div className="card">
                {/* Filters Header */}
                <div className="row mb-2" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="card__title">Explore Docs</div>

                    <input className="input" placeholder="Search (Num, Entity, Ref)..."
                        value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
                        style={{ width: 220 }} />

                    <select className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} title="Estado">
                        <option value="">All Status</option>
                        <option value="uploaded">Uploaded</option>
                        <option value="extracted">Extracted</option>
                        <option value="saved">Saved</option>
                        <option value="processado">Processado</option>
                    </select>

                    <select className="input" value={docTypeFilter} onChange={e => { setDocTypeFilter(e.target.value); setPage(1); }} title="Tipo Documental">
                        <option value="">All Types</option>
                        {docTypes.map(t => {
                            const val = typeof t === 'object' ? t.id : t;
                            const lab = typeof t === 'object' ? t.labelPt : t;
                            return <option key={val} value={val}>{lab}</option>
                        })}
                    </select>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                        {processing && <span className="muted mr-2">Processing...</span>}
                        <button className="btn" onClick={load}>Refresh</button>
                        <button className="btn primary" onClick={exportXlsx}>Export All</button>
                    </div>
                </div>

                {/* Bulk Actions Bar */}
                {selectedIds.size > 0 && (
                    <div className="row mb-2 p-2 bg-light" style={{ alignItems: 'center', gap: 10 }}>
                        <span>{selectedIds.size} selected</span>
                        <select className="input" style={{ width: 180 }} value={bulkDocType} onChange={e => setBulkDocType(e.target.value)}>
                            <option value="">Apply DocType...</option>
                            {docTypes.map(t => { const val = typeof t === 'object' ? t.id : t; const lab = typeof t === 'object' ? t.labelPt : t; return <option key={val} value={val}>{lab}</option> })}
                        </select>
                        <button className="btn btn--tiny primary" onClick={applyBulkDocType}>Apply</button>
                        <div style={{ width: 1, height: 20, background: '#ccc', margin: '0 10px' }}></div>
                        <button className="btn btn--tiny" onClick={() => setShowTxModal(true)}>📂 Create Transaction</button>
                    </div>
                )}

                {/* Table */}
                <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}><input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleSelectAll} /></th>
                                <th>Status</th>
                                <th>File</th>
                                <th>Type</th>
                                <th>Number</th>
                                <th>Date</th>
                                <th>Entity</th>
                                <th>Total</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? <tr><td colSpan="9" style={{ textAlign: 'center', padding: 20 }}>No items found.</td></tr> : rows.map(r => {
                                const isEdit = editing === r.id;
                                const docTypeOpts = docTypes.length ? docTypes : ['Fatura', 'Nota de Crédito', 'Recibo'];
                                const currentVal = r.docTypeId || r.docType || '';

                                return (
                                    <tr key={r.id} className={r.needsReview ? 'row-warning' : ''}>
                                        <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                                        <td>
                                            <Badge>{r.status}</Badge>
                                            {r.extractionMethod === 'ai' && <small className="text-muted ml-1" title="AI Extracted">🤖</small>}
                                            {r.needsReview && <span className="tag warning ml-1" title="Review">⚠</span>}
                                        </td>
                                        <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.origName}>{r.origName}</td>

                                        <td>
                                            {(!isEdit && !r.needsReviewDocType && r.docTypeLabel) ? (
                                                <span style={{ cursor: 'pointer', borderBottom: '1px dashed #ccc' }} onClick={() => startEdit(r)}>{r.docTypeLabel}</span>
                                            ) : (
                                                <select className="input" style={isEdit ? {} : { border: 'none', background: 'transparent', padding: 0 }}
                                                    disabled={!isEdit && !r.needsReviewDocType}
                                                    value={isEdit ? (draft.docTypeId || draft.docType || '') : currentVal}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (isEdit) {
                                                            const found = docTypeOpts.find(t => (typeof t === 'object' ? t.id : t) === val);
                                                            setDraft(d => ({ ...d, docTypeId: val, docType: typeof found === 'object' ? found.labelPt : val }));
                                                        } else { updateDocType(r.id, val); }
                                                    }}>
                                                    <option value="">{r.docTypeLabel || '(Select)'}</option>
                                                    {docTypeOpts.map(t => {
                                                        const val = typeof t === 'object' ? t.id : t;
                                                        const lab = typeof t === 'object' ? t.labelPt : t;
                                                        return <option key={val} value={val}>{lab}</option>
                                                    })}
                                                </select>
                                            )}
                                        </td>
                                        <td>{isEdit ? <input className="input" value={draft.docNumber || ''} onChange={e => setDraft(d => ({ ...d, docNumber: e.target.value }))} style={{ width: 80 }} /> : r.docNumber}</td>
                                        <td>{isEdit ? <input type="date" className="input" value={draft.date || ''} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /> : r.date}</td>
                                        <td>{isEdit ? <input className="input" value={draft.customer || ''} onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))} /> : (r.customer || r.supplier || '-')}</td>
                                        <td>{isEdit ? <input className="input" value={draft.total || ''} onChange={e => setDraft(d => ({ ...d, total: e.target.value }))} style={{ width: 60 }} /> : fmtEUR(r.total)}</td>
                                        <td>
                                            {isEdit ? (
                                                <>
                                                    <button className="btn btn--tiny primary" onClick={saveEdit}>Save</button>
                                                    <button className="btn btn--tiny" onClick={cancelEdit}>X</button>
                                                </>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="btn btn--tiny" onClick={() => startEdit(r)}>✎</button>
                                                    <button className="btn btn--tiny" onClick={() => showSuggestions(r)} title="Link">🔗</button>
                                                    {r.status !== 'processado' && <button className="btn btn--tiny success" onClick={() => finalize(r)}>✓</button>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="row mt-4" style={{ alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                    <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>&laquo; Prev</button>
                    <span>Page <strong>{page}</strong> of {totalPages || 1} <small className="muted">({total} items)</small></span>
                    <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next &raquo;</button>
                </div>
            </div>

            {/* Modals - Transaction & Suggestions (Keep Logic Same) */}
            {showTxModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ width: 500, padding: 20, background: 'var(--bg-card)' }}>
                        <h3>Create Transaction</h3>
                        <p>{selectedIds.size} docs selected.</p>
                        <input className="input" style={{ width: '100%' }} placeholder="Title" value={txTitle} onChange={e => setTxTitle(e.target.value)} />
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn" onClick={() => setShowTxModal(false)}>Cancel</button>
                            <button className="btn primary" onClick={createTransactionFromSelection}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {suggestionsDoc && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>Link Suggestions {suggestionsDoc.docNumber}</h3>
                        {suggestionsLoading ? <p>Loading...</p> : (
                            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                <table className="table"><thead><tr><th>Doc</th><th>Score</th><th>Action</th></tr></thead>
                                    <tbody>{suggestions.map(s => <tr key={s.id}><td>{s.docNumber}</td><td>{s.score}</td><td><button onClick={() => linkDocs(s.id)}>Link</button></td></tr>)}</tbody></table>
                            </div>
                        )}
                        <button className="btn" onClick={() => setSuggestionsDoc(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
