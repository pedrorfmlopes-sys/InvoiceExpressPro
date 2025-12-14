import React, { useState, useEffect } from 'react';
import { Badge } from '../shared/ui';
import api from '../api/apiClient';

export default function TransactionsV2Tab({ project }) {
    const [txs, setTxs] = useState([]);
    const [activeTx, setActiveTx] = useState(null); // Detail View
    const [loading, setLoading] = useState(false);

    // List
    async function load() {
        setLoading(true);
        try {
            const res = await api.get(`/api/v2/transactions?project=${project}`);
            setTxs(res.data.rows);
        } catch (e) { alert('Load error: ' + e.message); }
        finally { setLoading(false); }
    }

    useEffect(() => { load(); }, [project]);

    // Create (Simple for now)
    async function createTx() {
        const title = prompt("Transaction Title (e.g. Order 123):");
        if (!title) return;
        try {
            await api.post(`/api/v2/transactions?project=${project}`, { title });
            load();
        } catch (e) { alert('Create error: ' + e.message); }
    }

    // Detail Loader
    async function openTx(id) {
        try {
            const res = await api.get(`/api/v2/transactions/${id}?project=${project}`);
            setActiveTx(res.data.transaction);
        } catch (e) { alert('Detail error: ' + e.message); }
    }

    // Detail View Component
    if (activeTx) {
        return (
            <div className="v2-container">
                <button className="btn mb-4" onClick={() => setActiveTx(null)}>← Back to List</button>
                <div className="card">
                    <div className="card__title">{activeTx.title}</div>
                    <div>Status: <Badge>{activeTx.status}</Badge></div>
                    <div className="mt-4">
                        <h4>Attached Documents</h4>
                        {!activeTx.docs.length && <p className="text-muted">No documents attached.</p>}
                        <table className="table mt-2">
                            <thead><tr><th>Doc Type</th><th>Number</th><th>File</th></tr></thead>
                            <tbody>
                                {activeTx.docs.map(d => (
                                    <tr key={d.id}>
                                        <td>{d.docTypeLabel || d.docType}</td>
                                        <td>{d.docNumber}</td>
                                        <td>{d.origName}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="v2-container">
            <div className="row mb-4">
                <h2 style={{ margin: 0 }}>Transactions</h2>
                <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={createTx}>+ New Case</button>
            </div>

            <div className="card">
                {loading && <p>Loading...</p>}
                {!loading && txs.length === 0 && <p className="text-muted">No transactions found.</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {txs.map(t => (
                        <div key={t.id} className="card" style={{ border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openTx(t.id)}>
                            <div style={{ fontWeight: 600 }}>{t.title || 'Untitled'}</div>
                            <div className="text-muted small mt-1">Created: {new Date(t.created_at).toLocaleDateString()}</div>
                            <div className="mt-2"><Badge>{t.status}</Badge></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
