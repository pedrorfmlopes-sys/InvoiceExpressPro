import React, { useState, useEffect } from 'react';
import api from '../api/apiClient';

const API_BASE = '/api';

export default function TransactionsTab({ project }) {
    const [view, setView] = useState('list'); // list | detail | create
    const [items, setItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Detail State
    const [linkedDocs, setLinkedDocs] = useState([]);
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (view === 'list') fetchList();
    }, [project, view]);

    const fetchList = async () => {
        setLoading(true);
        try {
            const res = await api.get(`${API_BASE}/transactions?project=${project}`);
            setItems(res.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const openDetail = async (id) => {
        setLoading(true);
        try {
            const res = await api.get(`${API_BASE}/transactions/${id}?project=${project}`);
            setCurrentItem(res.data);
            setView('detail');
            // Fetch suggestions too?
            fetchSuggestions(id);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuggestions = async (id) => {
        try {
            const res = await api.get(`${API_BASE}/transactions/${id}/suggestions?project=${project}&threshold=0.3`);
            setSuggestions(res.data);
        } catch (e) { }
    };

    const applySuggestions = async () => {
        if (!currentItem) return;
        try {
            await api.post(`${API_BASE}/transactions/${currentItem.id}/apply-suggestions?project=${project}`, { threshold: 0.3 });
            openDetail(currentItem.id); // Reload
        } catch (e) { alert(e.message); }
    };

    const createTransaction = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
            title: fd.get('title'),
            description: fd.get('description'),
            counterparty: fd.get('counterparty')
        };

        try {
            await api.post(`${API_BASE}/transactions?project=${project}`, payload);
            setView('list');
            fetchList();
        } catch (e) {
            setError(e.message);
        }
    };

    const downloadZip = async () => {
        if (!currentItem) return;
        try {
            // Use authenticated blob download
            const res = await api.get(`${API_BASE}/transactions/${currentItem.id}/download.zip?project=${project}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `dossier-${currentItem.title}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            if (e.response && e.response.status === 403) alert('Preview/Normal Plan cannot download (Entitlement)');
            else alert('Download failed: ' + e.message);
        }
    };

    // -- RENDERERS --

    if (view === 'create') {
        return (
            <div style={{ padding: 20 }}>
                <h2>New Transaction</h2>
                <form onSubmit={createTransaction}>
                    <div style={{ marginBottom: 10 }}>
                        <label>Title:</label><br />
                        <input name="title" required style={{ width: '100%' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label>Counterparty:</label><br />
                        <input name="counterparty" style={{ width: '100%' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label>Description:</label><br />
                        <textarea name="description" style={{ width: '100%', height: 60 }} />
                    </div>
                    <button type="submit">Create</button>
                    <button type="button" onClick={() => setView('list')} style={{ marginLeft: 10 }}>Cancel</button>
                </form>
            </div>
        );
    }

    if (view === 'detail' && currentItem) {
        return (
            <div style={{ padding: 20 }}>
                <button onClick={() => setView('list')}>&larr; Back</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>{currentItem.title} <span style={{ fontSize: '0.6em', background: '#ccc', padding: 3, borderRadius: 3 }}>{currentItem.status}</span></h2>
                    <button onClick={downloadZip} style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}>Download Pack (.zip)</button>
                </div>
                <p><strong>Org:</strong> {currentItem.orgId} <strong>Project:</strong> {currentItem.project}</p>
                <p><strong>Target:</strong> {currentItem.counterparty || 'N/A'}</p>
                <p>{currentItem.description}</p>

                <hr />

                <h3>Linked Documents ({currentItem.links?.length || 0})</h3>
                <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr><th>Doc ID</th><th>Type</th><th>Source</th><th>Score</th></tr>
                    </thead>
                    <tbody>
                        {currentItem.links?.map(l => (
                            <tr key={l.id}>
                                <td>{l.documentId}</td>
                                <td>{l.linkType}</td>
                                <td>{l.source}</td>
                                <td>{l.confidence}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {suggestions.length > 0 && (
                    <div style={{ marginTop: 20, background: '#f9f9f9', padding: 10, border: '1px solid #ddd' }}>
                        <h4>Suggestions ({suggestions.length})</h4>
                        <ul>
                            {suggestions.map((s, i) => (
                                <li key={i}>
                                    Doc <strong>{s.documentId}</strong> (Score: {s.confidence.toFixed(2)}) - {s.reason}
                                </li>
                            ))}
                        </ul>
                        <button onClick={applySuggestions}>Apply All Suggestions</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2>Transactions</h2>
                <button onClick={() => setView('create')}>+ New Transaction</button>
            </div>

            {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}

            <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Counterparty</th>
                        <th>Status</th>
                        <th>Docs</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(it => (
                        <tr key={it.id}>
                            <td>{it.title}</td>
                            <td>{it.counterparty}</td>
                            <td>{it.status}</td>
                            <td>{it.docCount}</td>
                            <td>
                                <button onClick={() => openDetail(it.id)}>Open</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
