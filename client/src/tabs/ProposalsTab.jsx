
import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ActionBar } from '../components/ui/ActionBar';
import api from '../api/apiClient';
import { fmtEUR, qp } from '../shared/ui';
import { getViewer } from '../components/viewers/ViewerRegistry';
import { createPortal } from 'react-dom';

export default function ProposalsTab({ project, setEditingProposalId }) {
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewDoc, setViewDoc] = useState(null);
    const [viewPdfUrl, setViewPdfUrl] = useState(null);

    useEffect(() => {
        loadProposals();
    }, [project]);

    const loadProposals = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/proposals?project=${project}`);
            setProposals(res.data);
        } catch (e) {
            console.error("Failed to load proposals", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Tem a certeza que deseja apagar a proposta "${name}"? Esta ação é irreversível.`)) return;
        try {
            await api.delete(`/api/proposals/${id}`);
            setProposals(prev => prev.filter(p => p.id !== id));
        } catch (e) {
            alert("Erro ao apagar: " + e.message);
        }
    };

    const handleViewSource = async (docId) => {
        try {
            const res = await api.get(qp(`/api/corev2/docs/${docId}`, project));
            const doc = res.data;
            if (getViewer(doc)) {
                setViewDoc(doc);
            } else {
                const resView = await api.get(qp(`/api/corev2/docs/${docId}/view`, project), { responseType: 'blob' });
                setViewPdfUrl(URL.createObjectURL(resView.data));
            }
        } catch (e) {
            alert("Erro ao abrir documento: " + e.message);
        }
    };

    const handleExport = async (id, format) => {
        try {
            if (format === 'pdf') {
                // High-Quality Client Side Generation (Unification)
                const pRes = await api.get(`/api/proposals/${id}`);
                const proposal = pRes.data;

                // Dynamically import to keep bundle small if not used
                const { pdf } = await import('@react-pdf/renderer');
                const ProposalPdf = (await import('../components/proposals/ProposalPdf')).default;

                const blob = await pdf(<ProposalPdf proposal={proposal} />).toBlob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `proposta_${proposal.name?.replace(/[^a-z0-9]/gi, '_') || id}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                return;
            }

            // Excel & fallback
            const res = await api.get(`/api/proposals/${id}/${format}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `proposta_${id}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            alert("Erro ao exportar: " + e.message);
        }
    };

    const calculateTotal = (lines) => {
        if (!lines) return 0;
        return lines.reduce((acc, l) => {
            const qty = parseFloat(l.quantity || 0);
            const price = parseFloat(l.unit_price_commercial || 0);
            const desc = parseFloat(l.discount_commercial_percent || 0);
            const lineNet = qty * price * (1 - desc / 100);
            const vat = lineNet * (parseFloat(l.vat_rate || 23) / 100);
            return acc + lineNet + vat;
        }, 0);
    };

    const filteredProposals = proposals.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.client_ref && p.client_ref.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar">

            {/* Header / Actions */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Estúdio de Propostas</h2>
                    <p className="text-sm text-[var(--text-muted)]">Gerencie, edite e exporte as suas propostas comerciais.</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative group">
                        <input
                            className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-4 py-2 pl-10 text-sm w-64 outline-none focus:border-[var(--accent-primary)] transition-colors"
                            placeholder="Pesquisar propostas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
                    </div>
                </div>
            </div>

            {/* Main List */}
            <GlassCard className="flex-1 min-h-0 flex flex-col">
                <div className="overflow-auto custom-scrollbar flex-1 -mx-6 px-6">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-[var(--bg-card)] z-10 shadow-sm">
                            <tr className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)]">
                                <th className="pb-4 font-bold pl-4">Proposta</th>
                                <th className="pb-4 font-bold">Cliente</th>
                                <th className="pb-4 font-bold">Referência</th>
                                <th className="pb-4 font-bold">Doc. Origem</th>
                                <th className="pb-4 font-bold text-right">Total (c/IVA)</th>
                                <th className="pb-4 font-bold text-center">Estado</th>
                                <th className="pb-4 font-bold text-right pr-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="py-12 text-center text-[var(--text-muted)] animate-pulse">
                                        Carregando propostas...
                                    </td>
                                </tr>
                            ) : filteredProposals.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="py-12 text-center text-[var(--text-muted)] opacity-60">
                                        Nenhuma proposta encontrada.
                                    </td>
                                </tr>
                            ) : (
                                filteredProposals.map(p => {
                                    const total = calculateTotal(p.lines);
                                    return (
                                        <tr key={p.id} className="group hover:bg-[var(--surface-hover)] transition-colors">
                                            <td className="py-4 pl-4">
                                                <div className="font-bold text-sm text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors">
                                                    {p.name}
                                                </div>
                                                <div className="text-[10px] text-[var(--text-muted)] font-mono opacity-70">
                                                    {new Date(p.updated_at).toLocaleDateString('pt-PT')}
                                                </div>
                                            </td>
                                            <td className="py-4 text-sm font-medium">
                                                {p.client_ref || <span className="opacity-50 italic">Sem Cliente</span>}
                                            </td>
                                            <td className="py-4 text-xs font-mono text-[var(--text-muted)]">
                                                {p.metadata?.our_ref || '-'}
                                            </td>
                                            <td className="py-4">
                                                {p.original_doc_id ? (
                                                    <button
                                                        onClick={() => handleViewSource(p.original_doc_id)}
                                                        className="flex flex-col text-left hover:scale-105 transition-transform"
                                                    >
                                                        <span className="text-[10px] font-mono text-amber-500 font-bold border-b border-amber-500/20">{p.source_doc_number || 'Ver Doc'}</span>
                                                        <span className="text-[8px] text-gray-500 uppercase tracking-tighter">Vinculado</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] text-gray-600 italic">Manual</span>
                                                )}
                                            </td>
                                            <td className="py-4 text-right font-mono font-bold text-[var(--text-main)]">
                                                {fmtEUR(total)}
                                            </td>
                                            <td className="py-4 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border 
                                                    ${p.status === 'sent' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : ''}
                                                    ${p.status === 'draft' ? 'border-gray-500/30 bg-gray-500/10 text-gray-400' : ''}
                                                    ${p.status === 'accepted' ? 'border-green-500/30 bg-green-500/10 text-green-500' : ''}
                                                    ${p.status === 'rejected' ? 'border-red-500/30 bg-red-500/10 text-red-500' : ''}
                                                    ${p.status === 'closed_other' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : ''}
                                                `}>
                                                    {p.status === 'sent' && 'Enviada'}
                                                    {p.status === 'draft' && 'Rascunho'}
                                                    {p.status === 'accepted' && 'Aceite'}
                                                    {p.status === 'rejected' && 'Perdida'}
                                                    {p.status === 'closed_other' && 'Encerrada'}
                                                    {(!p.status || p.status === '') && 'Rascunho'}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right pr-4 flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleExport(p.id, 'pdf')}
                                                    className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-[var(--text-muted)] hover:text-white transition-colors"
                                                    title="PDF"
                                                >
                                                    📄
                                                </button>
                                                <button
                                                    onClick={() => handleExport(p.id, 'excel')}
                                                    className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-[var(--text-muted)] hover:text-white transition-colors"
                                                    title="Excel"
                                                >
                                                    📊
                                                </button>
                                                <button
                                                    onClick={() => setEditingProposalId(p.id)}
                                                    className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(p.id, p.name)}
                                                    className="p-2 hover:bg-red-500/10 rounded-lg text-[var(--text-muted)] hover:text-red-500 transition-colors"
                                                    title="Apagar"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Specialized Viewer Overlay */}
            {viewDoc && (() => {
                const ViewerComponent = getViewer(viewDoc);
                return (
                    <ViewerComponent
                        doc={viewDoc}
                        onClose={() => setViewDoc(null)}
                        updateRow={() => { }} // Read-only from here or implement if needed
                        mode="archive"
                    />
                );
            })()}

            {/* PDF Viewer Portal */}
            {viewPdfUrl && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative">
                        <div className="flex justify-between items-center p-4 border-b border-[var(--border)]">
                            <h3 className="font-bold text-lg">Visualizar Documento</h3>
                            <button onClick={() => setViewPdfUrl(null)} className="text-xl p-2 hover:bg-red-500/20 rounded-full transition-colors">✕</button>
                        </div>
                        <iframe src={viewPdfUrl} className="flex-1 w-full bg-white rounded-b-xl" />
                    </div>
                </div>, document.body
            )}
        </div>
    );
}
