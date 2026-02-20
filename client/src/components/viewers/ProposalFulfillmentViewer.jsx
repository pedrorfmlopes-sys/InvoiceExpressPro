import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';
import { fmtEUR, qp } from '../../shared/ui';
import { getViewer } from './ViewerRegistry';

/**
 * Visualizes the fulfillment status of a Proposal.
 * PROPOSAL CENTRIC VIEW: Includes Financials, Documents, and Logistics.
 */
export default function ProposalFulfillmentViewer({ proposalId, onClose, project }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewDoc, setViewDoc] = useState(null); // Nested Viewer

    // Filter/Tab Internal State
    const [tab, setTab] = useState('lines'); // lines, documents
    const [filterStatus, setFilterStatus] = useState('all'); // all, pending, partial, completed

    useEffect(() => {
        fetchData();
    }, [proposalId]);

    const getFilteredLines = () => {
        if (!data || !data.lines) return [];
        if (filterStatus === 'all') return data.lines;
        if (filterStatus === 'pending') return data.lines.filter(l => l.status === 'pending');
        if (filterStatus === 'partial') return data.lines.filter(l => l.status === 'partial');
        if (filterStatus === 'completed') return data.lines.filter(l => l.status === 'completed');
        return data.lines;
    };

    const filteredLines = getFilteredLines();

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/nicolazzi/proposals/${proposalId}/fulfillment`);
            setData(res.data);
        } catch (err) {
            setError(err.message || 'Erro ao carregar dados da proposta');
        } finally {
            setLoading(false);
        }
    };

    const handleReconcile = async (docId) => {
        try {
            await api.post(`/api/nicolazzi/reconcile/${docId}`);
            fetchData(); // Reload
        } catch (err) {
            alert('Falha ao reconciliar: ' + err.message);
        }
    };

    const handleViewDoc = async (id) => {
        try {
            // Use /json suffix and try without strict project filter first (or use 'all')
            // This prevents 404s if the document was uploaded in a different project context
            const res = await api.get(`/api/corev2/docs/${id}/json?project=all`);
            setViewDoc(res.data);
        } catch (err) {
            console.error("ViewDoc Error:", err);
            alert('Falha ao carregar documento: ' + (err.response?.data?.error || err.message));
        }
    };

    if (!proposalId) return null;

    // --- RENDER HELPERS ---
    const renderPrevDate = (dateStr) => {
        if (!dateStr) return <span className="text-gray-700 italic">n/d</span>;
        const d = new Date(dateStr);
        const today = new Date();
        const diffTime = d - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let color = 'text-green-500';
        if (diffDays < 0) color = 'text-red-500 font-bold';
        else if (diffDays === 0) color = 'text-red-400 font-bold animate-pulse';
        else if (diffDays <= 7) color = 'text-yellow-500 font-bold';

        return (
            <div className="flex flex-col items-center">
                <span className={`${color}`}>{renderDate(dateStr)}</span>
                {diffDays > 0 && <span className="text-[8px] opacity-40 uppercase">T-{diffDays} dias</span>}
                {diffDays === 0 && <span className="text-[8px] text-red-500 uppercase font-bold">HOJE</span>}
                {diffDays < 0 && <span className="text-[8px] text-red-700 uppercase font-bold">Atraso</span>}
            </div>
        );
    };

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'completed': return <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-400 text-[10px] uppercase font-bold border border-green-800">Concluído</span>;
            case 'partial': return <span className="px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 text-[10px] uppercase font-bold border border-yellow-800">Parcial</span>;
            default: return <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] uppercase font-bold border border-gray-700">Pendente</span>;
        }
    };

    const renderDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString();
    };


    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[6000] bg-[#050505] flex flex-col font-sans text-xs w-screen h-screen">

            {/* TOOLBAR */}
            <div className="h-16 bg-[#111] border-b border-[#333] flex items-center justify-between px-6 shrink-0 shadow-md">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <h2 className="text-gray-200 font-bold tracking-wider text-sm flex items-center gap-2">
                            <span className="text-indigo-500">PROPOSAL FULFILLMENT</span>
                            <span className="opacity-30">|</span>
                            {data?.proposal?.number || 'Loading...'}
                        </h2>
                        {data?.proposal?.client_ref && (
                            <span className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                <span>🏢</span> {data.proposal.client_ref}
                            </span>
                        )}
                    </div>

                    {/* Quick Stats in Toolbar */}
                    {data && (
                        <div className="flex items-center gap-6 pl-6 border-l border-[#333] h-10">
                            {/* PROGRESS BAR */}
                            <div className="w-32">
                                <div className="flex justify-between mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase font-bold">Progresso Físico</span>
                                    <span className="text-[9px] text-white font-bold">{data.stats.progress}%</span>
                                </div>
                                <div className="w-full bg-[#333] h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${data.stats.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                        style={{ width: `${data.stats.progress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={fetchData} className="px-3 py-1 bg-[#222] hover:bg-[#333] text-gray-300 border border-[#444] rounded transition-colors uppercase font-bold text-[10px] flex items-center gap-1">
                        <span>↻</span> Refresh
                    </button>
                    <button onClick={onClose} className="px-4 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded transition-colors uppercase font-bold text-[10px]">
                        ✕ Close
                    </button>
                </div>
            </div>

            {/* MAIN LAYOUT */}
            {data && !loading && (
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT: CONTENT */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">

                        {/* FILTERS & CONTROLS (Top) */}
                        <div className="p-4 border-b border-[#222] flex items-center justify-between">
                            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Detalhes de Linha</h3>
                            <div className="flex gap-2 items-center">
                                <button onClick={() => setFilterStatus('all')} className={`px-3 py-1 border border-[#333] rounded text-[10px] transition-colors ${filterStatus === 'all' ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300'}`}>Todos</button>
                                <button onClick={() => setFilterStatus('pending')} className={`px-3 py-1 border border-[#333] rounded text-[10px] transition-colors ${filterStatus === 'pending' ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300'}`}>Pendentes</button>
                                <button onClick={() => setFilterStatus('partial')} className={`px-3 py-1 border border-[#333] rounded text-[10px] transition-colors ${filterStatus === 'partial' ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300'}`}>Parciais</button>
                                <button onClick={() => setFilterStatus('completed')} className={`px-3 py-1 border border-[#333] rounded text-[10px] transition-colors ${filterStatus === 'completed' ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300'}`}>Concluídos</button>
                                <div className="w-px h-5 bg-[#333] mx-1"></div>
                                <button
                                    onClick={() => {
                                        if (!data?.lines) return;
                                        const propNum = data.proposal?.number || 'proposta';
                                        const confirmDate = data.proposal?.order_confirmation_date
                                            ? new Date(data.proposal.order_confirmation_date).toLocaleDateString('pt-PT') : '';
                                        const headers = ['Nº Proforma', 'SKU', 'Descrição', 'Data Confirmação', 'Data Prevista', 'Qtd Pedida', 'Qtd Servida', 'Qtd Pendente', 'Estado', 'Nº Documentos', 'Documentos'];
                                        const rows = (data.lines || []).map(l => [
                                            propNum, l.sku || '',
                                            '"' + (l.description || '').replace(/"/g, '""') + '"',
                                            confirmDate,
                                            l.predicted_ship_date ? new Date(l.predicted_ship_date).toLocaleDateString('pt-PT') : '',
                                            l.qty_ordered, l.qty_fulfilled, l.qty_remaining,
                                            l.status === 'completed' ? 'Concluído' : l.status === 'partial' ? 'Parcial' : 'Pendente',
                                            l.history.length,
                                            '"' + l.history.map(h => h.doc_number).join(', ') + '"'
                                        ]);
                                        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
                                        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `fulfillment_${propNum.replace(/\//g, '-')}.csv`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1 border border-green-800/50 rounded text-[10px] bg-green-900/20 text-green-400 hover:bg-green-900/40 transition-colors font-bold"
                                    title="Exportar para Excel (CSV)">
                                    📊 Exportar XLS
                                </button>
                            </div>
                        </div>

                        {/* TABLE (Middle - Expanded) */}
                        <div className="flex-1 overflow-auto custom-scrollbar p-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#111] text-[9px] uppercase text-gray-500 font-bold sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-2 py-2 w-8 text-center border-b border-[#333]">#</th>
                                        <th className="px-2 py-2 w-28 border-b border-[#333]">SKU</th>
                                        <th className="px-2 py-2 border-b border-[#333]">Descrição</th>
                                        <th className="px-2 py-2 w-16 text-center border-b border-[#333]">Cat.</th>
                                        {/* Merged: Prazo + Prev */}
                                        <th className="px-2 py-2 w-24 text-center border-b border-[#333]">
                                            <div>Prazo</div>
                                            <div className="text-[8px] text-gray-600 font-normal normal-case">Previsto</div>
                                        </th>
                                        {/* Qty ordered */}
                                        <th className="px-2 py-2 w-16 text-right border-b border-[#333]">Ped.</th>
                                        {/* Merged: Entregue + Pendente */}
                                        <th className="px-2 py-2 w-20 text-right border-b border-[#333] bg-[#1a2333]/30">
                                            <div className="text-blue-400/80">Entr.</div>
                                            <div className="text-gray-500/80 font-normal normal-case">Pend.</div>
                                        </th>
                                        {/* Merged: Custo + Venda */}
                                        <th className="px-2 py-2 w-24 text-right border-b border-[#333] bg-[#1a1a0a]/40">
                                            <div className="text-amber-500/80">Custo</div>
                                            <div className="text-green-600/70 font-normal normal-case">Venda</div>
                                        </th>
                                        {/* Merged: Lucro + Margem */}
                                        <th className="px-2 py-2 w-24 text-right border-b border-[#333] bg-[#0a1a0a]/40">
                                            <div className="text-green-400/80">Lucro €</div>
                                            <div className="text-green-600/60 font-normal normal-case">Margem %</div>
                                        </th>
                                        <th className="px-2 py-2 w-20 text-center border-b border-[#333]">Estado</th>
                                        <th className="px-2 py-2 w-[16%] border-b border-[#333]">Histórico</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#222]">
                                    {filteredLines.map((line, idx) => {
                                        let rowBg = 'hover:bg-[#1a1a1a]';
                                        if (line.status === 'completed') rowBg = 'bg-green-900/5 hover:bg-green-900/10';
                                        if (line.status === 'partial') rowBg = 'bg-yellow-900/5 hover:bg-yellow-900/10';
                                        const isOverDelivered = line.qty_fulfilled > line.qty_ordered;
                                        const hasMargin = line.unit_price_factory > 0 || line.margin_percent !== 0;

                                        return (
                                            <tr key={idx} className={`transition-colors ${rowBg}`}>
                                                <td className="px-2 py-1.5 text-center text-gray-600 font-mono text-[10px]">{idx + 1}</td>
                                                <td className="px-2 py-1.5 font-mono font-bold text-gray-300 text-[10px]">{line.sku}</td>
                                                <td className="px-2 py-1.5 text-gray-400 text-[11px]">{line.description}</td>

                                                {/* Cat */}
                                                <td className="px-2 py-1.5 text-center">
                                                    {line.production_category
                                                        ? <span className="px-1 py-0.5 rounded bg-[#222] text-[8px] text-gray-400 border border-[#333] uppercase">{line.production_category.replace('_', ' ')}</span>
                                                        : <span className="opacity-20">-</span>}
                                                </td>

                                                {/* Merged: Prazo + Prev */}
                                                <td className="px-2 py-1.5 text-center">
                                                    <div className="text-[10px] text-gray-500">{line.lead_time_weeks ? `${line.lead_time_weeks}s` : '-'}</div>
                                                    <div className="text-[9px] font-mono mt-0.5">{renderPrevDate(line.predicted_ship_date)}</div>
                                                </td>

                                                {/* Qty Ordered */}
                                                <td className="px-2 py-1.5 text-right font-mono font-bold text-white text-[11px]">
                                                    {line.qty_ordered}<span className="text-[8px] text-gray-600 font-normal ml-0.5">{line.uom}</span>
                                                </td>

                                                {/* Merged: Entregue + Pendente */}
                                                <td className="px-2 py-1.5 text-right bg-blue-900/5">
                                                    <div className={`font-mono font-bold text-[11px] ${isOverDelivered ? 'text-yellow-400' : 'text-blue-400'}`}>
                                                        {line.qty_fulfilled}
                                                    </div>
                                                    <div className="font-mono text-[10px] text-gray-500 mt-0.5">
                                                        {isOverDelivered
                                                            ? <span className="text-yellow-600">+{line.qty_fulfilled - line.qty_ordered}</span>
                                                            : line.qty_remaining > 0 ? line.qty_remaining : <span className="text-green-600">✔</span>}
                                                    </div>
                                                </td>

                                                {/* Merged: Custo + Venda */}
                                                <td className="px-2 py-1.5 text-right bg-[#1a1a0a]/20">
                                                    <div className="font-mono text-[10px] text-amber-500/80">
                                                        {hasMargin ? fmtEUR(line.unit_price_factory) : <span className="opacity-20">—</span>}
                                                    </div>
                                                    <div className="font-mono text-[10px] text-gray-300 mt-0.5">
                                                        {fmtEUR(line.unit_price_commercial)}
                                                    </div>
                                                </td>

                                                {/* Merged: Lucro + Margem */}
                                                <td className="px-2 py-1.5 text-right bg-[#0a1a0a]/20">
                                                    {hasMargin ? (
                                                        <>
                                                            <div className={`font-mono font-bold text-[11px] ${line.net_margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {fmtEUR(line.net_margin)}
                                                            </div>
                                                            <div className="mt-0.5">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${line.margin_percent >= 30 ? 'bg-green-900/50 text-green-300' :
                                                                    line.margin_percent >= 15 ? 'bg-yellow-900/50 text-yellow-300' :
                                                                        'bg-red-900/50 text-red-300'
                                                                    }`}>{line.margin_percent}%</span>
                                                            </div>
                                                        </>
                                                    ) : <span className="opacity-20 text-[10px]">—</span>}
                                                </td>

                                                <td className="px-2 py-1.5 text-center">
                                                    {renderStatusBadge(line.status)}
                                                </td>

                                                {/* HISTORY */}
                                                <td className="px-2 py-1.5">
                                                    <div className="flex flex-wrap gap-1">
                                                        {line.history.map((h, hIdx) => (
                                                            <div key={hIdx} className="bg-[#222] border border-[#333] rounded px-1.5 py-0.5 flex items-center gap-1.5">
                                                                <span className="text-[9px] font-mono text-blue-300 font-bold">{h.doc_number}</span>
                                                                <span className="text-[9px] font-bold text-white bg-blue-900/50 px-1 rounded-sm">{h.qty}</span>
                                                            </div>
                                                        ))}
                                                        {line.history.length === 0 && <span className="text-[9px] text-gray-700 italic">-</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* FINANCIAL DASHBOARD (Bottom) */}
                        <div className="grid grid-cols-4 gap-4 p-6 border-t border-[#222] bg-[#0f0f0f]">
                            <div className="bg-[#151515] p-4 rounded-lg border border-[#333]">
                                <span className="text-[#666] text-[10px] uppercase font-bold tracking-wider">Total Pedido (S/ IVA)</span>
                                <div className="text-xl text-white font-mono font-bold mt-1">{fmtEUR(data.financial?.ordered?.net)}</div>
                                <div className="text-[10px] text-[#444] mt-1">c/ IVA: {fmtEUR(data.financial?.ordered?.gross)}</div>
                            </div>
                            <div className="bg-[#151515] p-4 rounded-lg border border-[#333]">
                                <span className="text-blue-500/70 text-[10px] uppercase font-bold tracking-wider">Fornecido (S/ IVA)</span>
                                <div className="text-xl text-blue-400 font-mono font-bold mt-1">{fmtEUR(data.financial?.fulfilled?.net)}</div>
                                <div className="text-[10px] text-[#444] mt-1">c/ IVA: {fmtEUR(data.financial?.fulfilled?.gross)}</div>
                            </div>
                            <div className="bg-[#151515] p-4 rounded-lg border border-[#333]">
                                <span className="text-orange-500/70 text-[10px] uppercase font-bold tracking-wider">Pendente (S/ IVA)</span>
                                <div className="text-xl text-orange-400 font-mono font-bold mt-1">{fmtEUR(data.financial?.pending?.net)}</div>
                                <div className="text-[10px] text-[#444] mt-1">c/ IVA: {fmtEUR(data.financial?.pending?.gross)}</div>
                            </div>
                            <div className="bg-[#151515] p-4 rounded-lg border border-[#333]">
                                <div className="flex justify-between items-start">
                                    <span className="text-green-400 text-[10px] uppercase font-bold tracking-wider">Margem & Lucro</span>
                                    <span className="text-[14px]">📈</span>
                                </div>
                                <div className="mt-2 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] text-amber-500/70 uppercase font-bold">Total Compra</span>
                                        <span className="font-mono text-amber-400 font-bold text-sm">{fmtEUR(data.financial?.cost?.net)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] text-gray-400 uppercase font-bold">Total Venda</span>
                                        <span className="font-mono text-white font-bold text-sm">{fmtEUR(data.financial?.ordered?.net)}</span>
                                    </div>
                                    <div className="h-px bg-[#333] my-1"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] text-green-400 uppercase font-bold">Lucro Total</span>
                                        <span className={`font-mono font-bold text-base ${(data.financial?.margin?.net || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {fmtEUR(data.financial?.margin?.net)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] text-green-500/70 uppercase font-bold">Margem</span>
                                        <span className={`px-2 py-0.5 rounded font-mono font-black text-sm ${(data.financial?.margin?.percent || 0) >= 30 ? 'bg-green-900/40 text-green-300' :
                                            (data.financial?.margin?.percent || 0) >= 15 ? 'bg-yellow-900/40 text-yellow-300' :
                                                'bg-red-900/40 text-red-300'
                                            }`}>
                                            {data.financial?.margin?.percent ?? '-'}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: DOCUMENTS SIDEBAR */}
                    <div className="w-64 bg-[#0e0e0e] border-l border-[#222] flex flex-col">

                        {/* MINI CHARTS SECTION */}
                        {data.documents.filter(d => d.type === 'invoice').length > 0 && (
                            <div className="p-4 border-b border-[#222]">
                                <h3 className="text-indigo-400 font-bold text-[10px] uppercase tracking-wider mb-4">Análise de Deadlines</h3>

                                <div className="space-y-4">
                                    {/* Lead Time Mini Chart */}
                                    <div>
                                        <div className="flex justify-between text-[8px] uppercase font-bold text-gray-500 mb-2">
                                            <span>Distribuição Lead-Time (Dias)</span>
                                            <span>Média: {data.metrics?.avg_days_to_delivery}</span>
                                        </div>
                                        <div className="flex items-end gap-1 h-12">
                                            {data.documents.filter(d => d.type === 'invoice').map((doc, idx) => {
                                                const maxDays = Math.max(...data.documents.filter(d => d.type === 'invoice').map(d => d.lead_time_days || 0), 30);
                                                const height = ((doc.lead_time_days || 0) / maxDays) * 100;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex-1 bg-indigo-500/20 border-t border-indigo-500/50 hover:bg-indigo-500/40 transition-all rounded-t-sm group relative"
                                                        style={{ height: `${Math.max(height, 5)}%` }}
                                                        title={`${doc.number}: ${doc.lead_time_days} dias`}
                                                    >
                                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[7px] text-white font-mono whitespace-nowrap bg-black px-1 rounded">
                                                            {doc.lead_time_days}d
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex justify-between text-[7px] text-gray-700 mt-1 font-mono">
                                            <span>Pedido</span>
                                            <span>Última Fat.</span>
                                        </div>
                                    </div>

                                    {/* Success Rate Dot */}
                                    <div className="bg-[#1a1a1a] p-2 rounded border border-[#333] flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-gray-500 uppercase font-bold">Taxa de Cumprimento</span>
                                            <span className="text-xs text-green-500 font-bold">{data.stats.progress}%</span>
                                        </div>
                                        <div className="w-8 h-8 rounded-full border-2 border-[#333] flex items-center justify-center relative">
                                            <svg className="w-full h-full -rotate-90">
                                                <circle
                                                    cx="50%" cy="50%" r="40%"
                                                    className="stroke-green-500 fill-none"
                                                    strokeWidth="3"
                                                    strokeDasharray={`${data.stats.progress * 0.25}, 100`}
                                                />
                                            </svg>
                                            <span className="absolute text-[7px] text-white font-bold">OK</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-4 border-b border-[#222] bg-[#111]/30">
                            <h3 className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Documentos Relacionados</h3>
                        </div>
                        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
                            {[...data.documents]
                                .sort((a, b) => (a.type === 'source' ? -1 : b.type === 'source' ? 1 : 0))
                                .map((doc, idx) => (
                                    <div key={idx}
                                        onClick={() => setViewDoc(doc)}
                                        className={`hover:bg-[#1a1a1a] border transition-colors p-3 rounded-lg cursor-pointer group ${doc.type === 'source'
                                                ? 'bg-indigo-900/10 border-indigo-800/40 hover:border-indigo-700/60'
                                                : 'bg-[#151515] border-[#333] hover:border-gray-600'
                                            }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${doc.type === 'source' ? 'bg-indigo-900/30 text-indigo-300 border-indigo-800/50' : 'bg-blue-900/20 text-blue-400 border-blue-900/30'
                                                }`}>
                                                {doc.type === 'source' ? 'Origem' : 'Fatura'}
                                            </span>
                                            <span className="text-[9px] text-gray-500">{renderDate(doc.date)}</span>
                                        </div>
                                        <div className="font-mono font-bold text-gray-200 group-hover:text-white mb-1">
                                            {doc.number}
                                        </div>
                                        <div className="text-[10px] text-gray-500 flex justify-between">
                                            <span>Total:</span>
                                            <span className="text-gray-300 font-bold">{fmtEUR(doc.total)}</span>
                                        </div>
                                        <div className="mt-2 text-[9px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase font-bold text-right">
                                            Abrir ↗
                                        </div>
                                    </div>
                                ))}

                            {data.documents.length === 0 && data.potentialMatches?.length === 0 && (
                                <div className="text-center p-8 text-gray-700 text-[10px] italic">
                                    Nenhum documento vinculado
                                </div>
                            )}

                            {/* POTENTIAL MATCHES */}
                            {data.potentialMatches?.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-[#333]">
                                    <h4 className="text-amber-500 font-bold text-[9px] uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <span>⚠️</span> Faturas Detetadas
                                    </h4>
                                    <div className="flex flex-col gap-2">
                                        {data.potentialMatches.map((pm, idx) => (
                                            <div key={idx} className="bg-amber-900/10 border border-amber-900/30 p-2 rounded-lg">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-mono text-amber-200 font-bold">{pm.number}</span>
                                                    <span className="text-[8px] text-amber-700">{renderDate(pm.date)}</span>
                                                </div>
                                                <div className="text-[9px] text-amber-500/70">{fmtEUR(pm.total)}</div>
                                                <button
                                                    onClick={() => handleReconcile(pm.id)}
                                                    className={`mt-2 w-full py-1 ${pm.isAlreadyLinked ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'} text-white rounded text-[9px] font-bold uppercase transition-colors`}
                                                >
                                                    {pm.isAlreadyLinked ? 'Sincronizar Linhas' : 'Vincular Agora'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            )}

            {/* ERROR STATE */}
            {error && !loading && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="p-8 border border-red-800 bg-red-900/10 text-red-400 rounded-lg text-center max-w-md">
                        <div className="text-2xl mb-2">⚠️</div>
                        {error}
                        <button onClick={onClose} className="mt-4 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 border border-red-800 rounded w-full transition-colors">Fechar</button>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #0a0a0a; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
            `}} />
            {/* Nested Document Viewer (Overlay) */}
            {
                viewDoc && (() => {
                    const ViewerComponent = getViewer(viewDoc);
                    if (!ViewerComponent) {
                        console.error("[Fulfillment] No Viewer found for doc:", viewDoc);
                        alert(`Não foi encontrado um visualizador compatível para este documento (${viewDoc.docType || 'Sem Tipo'}).`);
                        setViewDoc(null);
                        return null;
                    }
                    return (
                        <ViewerComponent
                            doc={viewDoc}
                            onClose={() => setViewDoc(null)}
                            updateRow={() => { fetchData(); }}
                            mode="archive"
                        />
                    );
                })()
            }
        </div>,
        document.body
    );
}
