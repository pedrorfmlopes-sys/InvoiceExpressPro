
import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ActionBar } from '../components/ui/ActionBar';
import api from '../api/apiClient';
import { fmtEUR, qp } from '../shared/ui';
import { getViewer } from '../components/viewers/ViewerRegistry';
import { createPortal } from 'react-dom';
import ProposalFulfillmentViewer from '../components/viewers/ProposalFulfillmentViewer';
import LogisticsManager from '../components/logistics/LogisticsManager';

export default function ProposalsTab({ project, setEditingProposalId }) {
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewDoc, setViewDoc] = useState(null);
    const [viewPdfUrl, setViewPdfUrl] = useState(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [filterDeadline, setFilterDeadline] = useState('all'); // all, on_time, overdue
    const [manageLogisticsId, setManageLogisticsId] = useState(null);
    const [viewFulfillmentId, setViewFulfillmentId] = useState(null);

    useEffect(() => {
        loadProposals();
    }, [project, filterStatus, filterBrand, search]);

    const loadProposals = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                project,
                status: filterStatus,
                brand_id: filterBrand,
                client_ref: search
            });
            const res = await api.get(`/api/proposals?${params.toString()}`);
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

    const handleExportConsolidated = async () => {
        try {
            const params = new URLSearchParams({
                project,
                status: filterStatus,
                brand_id: filterBrand,
                client_ref: search
            });
            const res = await api.get(`/api/proposals/export/items?${params.toString()}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `listagem_consolidada_itens_${new Date().toISOString().slice(0, 10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            alert("Erro ao exportar listagem: " + e.message);
        }
    };

    const handleStatusChange = async (proposalId, newStatus) => {
        try {
            await api.patch(`/api/proposals/${proposalId}`, { status: newStatus });
            if (newStatus === 'accepted') {
                await loadProposals(); // Multi-proposal side effects
            } else {
                setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: newStatus } : p));
            }
        } catch (e) {
            alert("Erro ao mudar estado: " + e.message);
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

    const filteredProposals = proposals.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.client_ref && p.client_ref.toLowerCase().includes(search.toLowerCase())) ||
            (p.metadata?.our_ref && p.metadata.our_ref.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;

        if (filterDeadline !== 'all') {
            if (!p.max_ship_date) return false;
            const isOverdue = new Date(p.max_ship_date) < new Date();
            if (filterDeadline === 'overdue' && !isOverdue) return false;
            if (filterDeadline === 'on_time' && isOverdue) return false;
        }

        return true;
    });

    const stats = {
        total: proposals.length,
        accepted: proposals.filter(p => p.status === 'accepted').length,
        sent: proposals.filter(p => p.status === 'sent').length,
        overdue: proposals.filter(p => p.max_ship_date && new Date(p.max_ship_date) < new Date() && p.status !== 'accepted' && p.status !== 'closed_other').length
    };

    return (
        <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar">

            {/* Header / Actions */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Estúdio de Propostas</h2>
                    <p className="text-sm text-[var(--text-muted)]">Gerencie, edite e exporte as suas propostas comerciais.</p>
                </div>
                <div className="flex gap-4 items-center">
                    {/* Deadline Filter */}
                    <div className="flex bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1">
                        <button
                            onClick={() => setFilterDeadline('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterDeadline === 'all' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilterDeadline('on_time')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterDeadline === 'on_time' ? 'bg-green-500/20 text-green-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            No Prazo
                        </button>
                        <button
                            onClick={() => setFilterDeadline('overdue')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterDeadline === 'overdue' ? 'bg-red-500/20 text-red-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Em Atraso
                        </button>
                    </div>

                    <select
                        className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent-primary)] transition-colors"
                        value={filterBrand}
                        onChange={e => setFilterBrand(e.target.value)}
                    >
                        <option value="">Todas as Marcas</option>
                        <option value="nicolazzi">Nicolazzi</option>
                        <option value="other">Outras</option>
                    </select>

                    <select
                        className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent-primary)] transition-colors"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="">Todos os Estados</option>
                        <option value="draft">Rascunho</option>
                        <option value="sent">Enviada</option>
                        <option value="accepted">Aceite</option>
                        <option value="rejected">Perdida</option>
                    </select>

                    <div className="relative group">
                        <input
                            className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-4 py-2 pl-10 text-sm w-48 outline-none focus:border-[var(--accent-primary)] transition-colors"
                            placeholder="Cliente..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-xs">🔍</span>
                    </div>

                    <button
                        onClick={handleExportConsolidated}
                        className="bg-[var(--accent-primary)] text-white px-4 py-2 rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2"
                        title="Exportar listagem de itens das propostas filtradas"
                    >
                        <span>📊</span> Exportar Itens
                    </button>
                </div>
            </div>

            {/* Stats Summary Area & Progress Bar */}
            <div className="space-y-4 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-[var(--surface-base)] border border-[var(--border)] p-4 rounded-2xl relative overflow-hidden group">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">Total Propostas</div>
                        <div className="text-2xl font-black text-white">{stats.total}</div>
                        <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full">
                            <div className="h-full bg-[var(--accent-primary)] transition-all duration-1000" style={{ width: '100%' }}></div>
                        </div>
                    </div>
                    <div className="bg-[var(--surface-base)] border border-[var(--border)] p-4 rounded-2xl relative overflow-hidden">
                        <div className="text-[10px] uppercase tracking-widest text-green-500 font-bold mb-1">Taxa de Conversão</div>
                        <div className="text-2xl font-black text-white">
                            {stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0}%
                        </div>
                        <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full">
                            <div className="h-full bg-green-500 transition-all duration-1000" style={{ width: `${stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>
                    <div className="bg-[var(--surface-base)] border border-[var(--border)] p-4 rounded-2xl relative overflow-hidden">
                        <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Enviadas</div>
                        <div className="text-2xl font-black text-white">{stats.sent}</div>
                        <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full">
                            <div className="h-full bg-blue-400 transition-all duration-1000" style={{ width: `${stats.total > 0 ? (stats.sent / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>
                    <div className="bg-[var(--surface-base)] border border-[var(--border)] p-4 rounded-2xl relative overflow-hidden">
                        <div className="text-[10px] uppercase tracking-widest text-red-500 font-bold mb-1">Atrasos de Saída</div>
                        <div className="text-2xl font-black text-white">{stats.overdue}</div>
                        <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full">
                            <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${stats.total > 0 ? (stats.overdue / stats.total) * 100 : 0}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Overall Pipeline Health Bar */}
                <div className="bg-[#111] border border-[#333] p-4 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">Saúde Logística Global</span>
                        <span className="text-[10px] font-mono text-green-500 font-bold">
                            {stats.total > 0 ? Math.round(((stats.total - stats.overdue) / stats.total) * 100) : 100}% No Prazo
                        </span>
                    </div>
                    <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden flex">
                        <div
                            className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000"
                            style={{ width: `${stats.total > 0 ? ((stats.total - stats.overdue) / stats.total) * 100 : 100}%` }}
                        ></div>
                        <div
                            className="h-full bg-red-600 transition-all duration-1000"
                            style={{ width: `${stats.total > 0 ? (stats.overdue / stats.total) * 100 : 0}%` }}
                        ></div>
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
                                <th className="pb-4 font-bold">Saída Fabrica</th>
                                <th className="pb-4 font-bold text-center">Prazo</th>
                                <th className="pb-4 font-bold text-right">Total (c/IVA)</th>
                                <th className="pb-4 font-bold text-center">Estado</th>
                                <th className="pb-4 font-bold text-right pr-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="py-12 text-center text-[var(--text-muted)] animate-pulse">
                                        Carregando propostas...
                                    </td>
                                </tr>
                            ) : filteredProposals.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="py-12 text-center text-[var(--text-muted)] opacity-60">
                                        Nenhuma proposta encontrada.
                                    </td>
                                </tr>
                            ) : (
                                filteredProposals.map(p => {
                                    const total = p.total_amount || calculateTotal(p.lines);
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
                                                {p.max_ship_date ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-indigo-400">
                                                            {new Date(p.max_ship_date).toLocaleDateString('pt-PT')}
                                                        </span>
                                                        <span className="text-[8px] uppercase text-gray-500">
                                                            Semana {Math.ceil(new Date(p.max_ship_date).getDate() / 7)}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-gray-600 italic">Por calcular</span>
                                                )}
                                            </td>
                                            <td className="py-4 text-center">
                                                {p.max_ship_date ? (() => {
                                                    const isOverdue = new Date(p.max_ship_date) < new Date();
                                                    if (p.status === 'accepted' || p.status === 'closed_other') {
                                                        return <span className="text-[9px] text-gray-500 uppercase font-bold opacity-40">Finalizado</span>;
                                                    }
                                                    return (
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${isOverdue ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                                                            {isOverdue ? 'Atrasado' : 'No Prazo'}
                                                        </span>
                                                    );
                                                })() : '-'}
                                            </td>
                                            <td className="py-4 text-right font-mono font-bold text-[var(--text-main)]">
                                                {fmtEUR(total)}
                                            </td>
                                            <td className="py-4 text-center">
                                                <div className="inline-block relative">
                                                    <select
                                                        value={p.status || 'draft'}
                                                        onChange={(e) => handleStatusChange(p.id, e.target.value)}
                                                        className={`appearance-none px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border cursor-pointer outline-none transition-all
                                                            ${p.status === 'sent' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : ''}
                                                            ${p.status === 'draft' ? 'border-gray-500/30 bg-gray-500/10 text-gray-400' : ''}
                                                            ${p.status === 'accepted' ? 'border-green-500/30 bg-green-500/10 text-green-500' : ''}
                                                            ${p.status === 'rejected' ? 'border-red-500/30 bg-red-500/10 text-red-500' : ''}
                                                            ${p.status === 'closed_other' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : ''}
                                                            hover:brightness-125
                                                        `}
                                                    >
                                                        <option value="draft">Rascunho</option>
                                                        <option value="sent">Enviada</option>
                                                        <option value="accepted">Aceite</option>
                                                        <option value="rejected">Perdida</option>
                                                        <option value="closed_other">Encerrada</option>
                                                    </select>
                                                </div>
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
                                                    onClick={() => setManageLogisticsId(p.id)}
                                                    className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-[var(--text-muted)] hover:text-orange-500 transition-colors"
                                                    title="Logística"
                                                >
                                                    🚚
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
            </GlassCard >

            {/* Specialized Viewer Overlay */}
            {
                viewDoc && (() => {
                    const ViewerComponent = getViewer(viewDoc);
                    return (
                        <ViewerComponent
                            doc={viewDoc}
                            onClose={() => setViewDoc(null)}
                            updateRow={() => { }} // Read-only from here or implement if needed
                            mode="archive"
                        />
                    );
                })()
            }

            {/* Logistics Manager Overlay */}
            {
                manageLogisticsId && (
                    <LogisticsManager
                        proposalId={manageLogisticsId}
                        onClose={() => setManageLogisticsId(null)}
                    />
                )
            }

            {/* Fulfillment Viewer Overlay */}
            {
                viewFulfillmentId && (
                    <ProposalFulfillmentViewer
                        proposalId={viewFulfillmentId}
                        project={project}
                        onClose={() => setViewFulfillmentId(null)}
                    />
                )
            }

            {/* PDF Viewer Portal */}
            {
                viewPdfUrl && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative">
                            <div className="flex justify-between items-center p-4 border-b border-[var(--border)]">
                                <h3 className="font-bold text-lg">Visualizar Documento</h3>
                                <button onClick={() => setViewPdfUrl(null)} className="text-xl p-2 hover:bg-red-500/20 rounded-full transition-colors">✕</button>
                            </div>
                            <iframe src={viewPdfUrl} className="flex-1 w-full bg-white rounded-b-xl" />
                        </div>
                    </div>, document.body
                )
            }
        </div >
    );
}
