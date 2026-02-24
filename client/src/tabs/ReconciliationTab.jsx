import React, { useEffect, useState } from 'react';
import api from '../api/apiClient';
import { fmtEUR } from '../shared/ui';
import ProposalFulfillmentViewer from '../components/viewers/ProposalFulfillmentViewer';
import GlobalReconciliationModal from '../components/logistics/GlobalReconciliationModal';

export default function ReconciliationTab() {
    const [report, setReport] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedProposalId, setSelectedProposalId] = useState(null);
    const [showGlobalModal, setShowGlobalModal] = useState(false);

    // Filters and Selection for Export
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, partial, completed
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportingLateItems, setExportingLateItems] = useState(false);

    // Initial Load
    useEffect(() => {
        loadReport();
    }, []);

    const loadReport = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/nicolazzi/report');
            setReport(res.data || []);

            // Also fetch global analytics
            try {
                const aRes = await api.get('/api/nicolazzi/analytics');
                setAnalytics(aRes.data);
            } catch (err) {
                console.error('Failed to load analytics', err);
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar relatório');
        } finally {
            setLoading(false);
        }
    };

    // Helper for Status Badge
    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed': return <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-400 text-[10px] uppercase font-bold border border-green-800">Concluído</span>;
            case 'partial': return <span className="px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 text-[10px] uppercase font-bold border border-yellow-800">Parcial</span>;
            default: return <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] uppercase font-bold border border-gray-700">Pendente</span>;
        }
    };

    // Filter Logic
    const filteredReport = report.filter(row => {
        // Status Match
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;

        // Text Match
        if (searchTerm.trim() !== '') {
            const query = searchTerm.toLowerCase().trim();
            // Try matching either proposal number, client ref, or the hidden search blob (skus/desc)
            if (row.search_blob && !row.search_blob.includes(query)) return false;
            if (!row.search_blob) { // fallback if API didn't return blob for some reason
                const matchName = (row.proposal_number || '').toLowerCase().includes(query);
                const matchClient = (row.client_ref || '').toLowerCase().includes(query);
                if (!matchName && !matchClient) return false;
            }
        }

        return true;
    });

    // Checkbox Logic
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(filteredReport.map(r => r.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleExportSelected = async () => {
        if (selectedIds.length === 0) return;
        setExportingExcel(true);
        try {
            const res = await api.post('/api/nicolazzi/report/export', { proposalIds: selectedIds }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `status_encomendas_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Falha ao exportar excel: ' + err.message);
        } finally {
            setExportingExcel(false);
        }
    };

    const handleExportPdfSelected = async () => {
        if (selectedIds.length === 0) return;
        setExportingPdf(true);
        try {
            const res = await api.post('/api/nicolazzi/report/export-pdf', { proposalIds: selectedIds }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `relatorio_status_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Falha ao exportar PDF: ' + err.message);
        } finally {
            setExportingPdf(false);
        }
    };

    const handleExportLateItems = async () => {
        setExportingLateItems(true);
        try {
            const res = await api.get('/api/nicolazzi/analytics/late-export', { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `nicolazzi_artigos_atraso.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Falha ao exportar atrasos: ' + err.message);
        } finally {
            setExportingLateItems(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#121212] text-gray-300 p-6 overflow-hidden">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Relatório de Reconciliação</h1>
                    <p className="text-sm text-gray-500 mt-1">Gestão de Fornecimento (Nicolazzi)</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Search Input */}
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                        <input
                            type="text"
                            placeholder="Proposta, cliente, artigo..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSelectedIds([]); // Reset selection on filter change
                            }}
                            className="bg-[#111] border border-[#333] text-gray-300 text-sm rounded pl-9 pr-3 py-2 outline-none focus:border-indigo-500 w-64 placeholder-gray-600 transition-colors"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setSelectedIds([]); // Reset selection on filter change
                        }}
                        className="bg-[#111] border border-[#333] text-gray-300 text-sm rounded px-3 py-2 outline-none"
                    >
                        <option value="all">Todos os Estados</option>
                        <option value="pending">Pendentes</option>
                        <option value="partial">Parciais</option>
                        <option value="completed">Concluídos</option>
                    </select>

                    <div className="flex border border-[#333] rounded overflow-hidden">
                        <button disabled={selectedIds.length === 0 || exportingExcel || exportingPdf} onClick={handleExportSelected} className="px-3 py-2 bg-[#222] hover:bg-emerald-900/40 text-emerald-400 font-bold text-xs transition-colors border-r border-[#333] disabled:opacity-50 disabled:cursor-not-allowed">
                            <span>📊</span> {exportingExcel ? 'A Exportar...' : `Excel`}
                        </button>
                        <button disabled={selectedIds.length === 0 || exportingExcel || exportingPdf} onClick={handleExportPdfSelected} className="px-3 py-2 bg-[#222] hover:bg-red-900/40 text-red-400 font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <span>📄</span> {exportingPdf ? 'A Exportar...' : `PDF`}
                        </button>
                        {selectedIds.length > 0 && (
                            <div className="px-3 py-2 bg-[#111] text-[10px] text-gray-500 font-mono border-l border-[#333] flex items-center">
                                {selectedIds.length} sel.
                            </div>
                        )}
                    </div>

                    <button onClick={() => setShowGlobalModal(true)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-sm transition-colors shadow shadow-indigo-900/40 flex items-center gap-2">
                        <span>⚡</span> Total Matching
                    </button>
                    <button onClick={loadReport} className="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#444] text-gray-300 font-bold rounded text-sm transition-colors">
                        ↻ Atualizar
                    </button>
                </div>
            </div>

            {/* GLOBAL ANALYTICS DASHBOARD */}
            {analytics && (
                <div className="grid grid-cols-4 gap-4 mb-6 shrink-0">
                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 flex flex-col justify-center relative group">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Atrasos (SLA)</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-bold font-mono text-red-500">{analytics.logistics.lateItemsCurrent}</span>
                            <span className="text-xs text-gray-400">artigos críticos</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1">{analytics.logistics.latePercentage}% de todo o pendente</span>

                        {/* Download button appears on hover */}
                        <button
                            disabled={exportingLateItems}
                            onClick={handleExportLateItems}
                            title="Extrair listagem de atrasos para Excel"
                            className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[#333] rounded transition-all text-gray-400 hover:text-white disabled:opacity-50"
                        >
                            {exportingLateItems ? '⏳' : '📥'}
                        </button>
                    </div>

                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 flex flex-col justify-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Lead Time Médio</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-bold font-mono text-white">{analytics.logistics.avgLeadTimeDays}</span>
                            <span className="text-xs text-gray-400">dias reais de espera</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1">Média do tempo até chegada</span>
                    </div>

                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 flex flex-col justify-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Volume Faturado</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-bold font-mono text-white">{fmtEUR(analytics.financial.revenue)}</span>
                        </div>
                        <span className="text-[10px] text-amber-500 mt-1">Custo: {fmtEUR(analytics.financial.cost)}</span>
                    </div>

                    <div className="bg-green-900/10 border border-green-800/40 rounded-lg p-4 flex flex-col justify-center">
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">Rentabilidade Real</span>
                            <span className="bg-green-900/50 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded">{analytics.financial.marginPercent}% Margem</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-bold font-mono text-green-400">{fmtEUR(analytics.financial.margin)}</span>
                        </div>
                        <span className="text-[10px] text-green-500/60 mt-1">Margem Líquida Total Nicolazzi</span>
                    </div>
                </div>
            )}

            {/* TABLE CONTAINER */}
            <div className="flex-1 overflow-auto border border-[#333] rounded-lg bg-[#1a1a1a]">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#111] text-[11px] uppercase text-gray-500 font-bold sticky top-0 z-10">
                        <tr>
                            <th className="p-4 border-b border-[#333] w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="accent-indigo-500"
                                    checked={filteredReport.length > 0 && selectedIds.length === filteredReport.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="p-4 border-b border-[#333]">Proposta</th>
                            <th className="p-4 border-b border-[#333]">Cliente</th>
                            <th className="p-4 border-b border-[#333] text-center">Itens (Total)</th>
                            <th className="p-4 border-b border-[#333] text-center">Entregue</th>
                            <th className="p-4 border-b border-[#333] w-1/4">Progresso</th>
                            <th className="p-4 border-b border-[#333] text-center">Estado</th>
                            <th className="p-4 border-b border-[#333] text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                        {loading ? (
                            <tr><td colSpan="8" className="p-10 text-center animate-pulse">A calcular dados...</td></tr>
                        ) : filteredReport.length === 0 ? (
                            <tr><td colSpan="8" className="p-10 text-center text-gray-600">Nenhum resultado encontrado.</td></tr>
                        ) : (
                            filteredReport.map((row) => (
                                <tr key={row.id} className="hover:bg-[#222] transition-colors group">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="accent-indigo-500"
                                            checked={selectedIds.includes(row.id)}
                                            onChange={() => handleSelectRow(row.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-mono font-bold text-yellow-500">{row.proposal_number}</td>
                                    <td className="p-4 text-gray-300">{row.client_ref || '-'}</td>
                                    <td className="p-4 text-center font-mono">{row.total_items}</td>
                                    <td className="p-4 text-center font-mono text-blue-400 font-bold">{row.fulfilled_items}</td>
                                    <td className="p-4">
                                        <div className="w-full bg-[#333] h-2 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 ${row.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                style={{ width: `${row.progress}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-right mt-1 text-gray-500">{row.progress}%</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        {getStatusBadge(row.status)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => setSelectedProposalId(row.id)}
                                            className="text-[11px] px-3 py-1 bg-[#111] hover:bg-black border border-[#333] rounded text-gray-400 hover:text-white transition-colors">
                                            Detalhes
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* VIEWER OVERLAY */}
            {selectedProposalId && (
                <ProposalFulfillmentViewer
                    proposalId={selectedProposalId}
                    onClose={() => setSelectedProposalId(null)}
                />
            )}

            {/* GLOBAL RECONCILIATION OVERLAY */}
            {showGlobalModal && (
                <GlobalReconciliationModal
                    onClose={() => setShowGlobalModal(false)}
                    onReconciled={loadReport} // reload background table when done
                />
            )}
        </div>
    );
}
