import React, { useEffect, useState } from 'react';
import api from '../api/apiClient';
import { fmtEUR } from '../shared/ui';
import ProposalFulfillmentViewer from '../components/viewers/ProposalFulfillmentViewer';
import GlobalReconciliationModal from '../components/logistics/GlobalReconciliationModal';

/**
 * RotatingAnalyticsCard Component
 * Cycles between Net Sale, Net Cost, and Margin on click.
 */
const RotatingAnalyticsCard = ({ label, project, realized }) => {
    const [view, setView] = useState('sale'); // sale, cost, margin

    const cycleView = () => {
        if (view === 'sale') setView('cost');
        else if (view === 'cost') setView('margin');
        else setView('sale');
    };

    const getData = () => {
        if (view === 'sale') return {
            title: 'Venda (Net)',
            val: realized.sale.net,
            iva: realized.sale.iva,
            gross: realized.sale.gross,
            sub: `Proj. Total: ${fmtEUR(project.sale.net)}`,
            color: 'text-white'
        };
        if (view === 'cost') return {
            title: 'Custo (Net)',
            val: realized.cost.net,
            iva: realized.cost.iva,
            gross: realized.cost.gross,
            sub: `Proj. Total: ${fmtEUR(project.cost.net)}`,
            color: 'text-amber-500'
        };
        return {
            title: 'Margem (Net)',
            val: realized.margin.net,
            iva: realized.margin.iva,
            gross: realized.margin.gross,
            sub: `${realized.margin.percent.toFixed(1)}% Margem Real`,
            color: 'text-green-400'
        };
    };

    const d = getData();

    return (
        <div
            onClick={cycleView}
            className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 flex flex-col justify-center cursor-pointer hover:border-indigo-500/50 transition-all select-none group"
        >
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</span>
                <span className="text-[9px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase font-black">Alternar Vista</span>
            </div>

            <div className="flex flex-col">
                <span className={`text-2xl font-black font-mono leading-none ${d.color}`}>{fmtEUR(d.val)}</span>
                <div className="flex gap-2 mt-1.5 items-center">
                    <span className="text-[10px] text-gray-500 font-mono">IVA: {fmtEUR(d.iva)}</span>
                    <div className="w-1 h-1 rounded-full bg-gray-700" />
                    <span className="text-[10px] text-gray-400 font-bold font-mono">Total: {fmtEUR(d.gross)}</span>
                </div>
            </div>

            <div className="flex justify-between items-end mt-3 pt-2 border-t border-[#222]">
                <span className="text-[10px] text-gray-500 font-bold uppercase">{d.title}</span>
                <span className="text-[10px] text-gray-600 italic font-medium">{d.sub}</span>
            </div>
        </div>
    );
};

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

    // Selection-based Analytics Update
    useEffect(() => {
        loadAnalytics(selectedIds);
    }, [selectedIds]);

    const loadReport = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/nicolazzi/report');
            setReport(res.data || []);
            // loadAnalytics will be triggered by selection reset or initial run
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar relatório');
        } finally {
            setLoading(false);
        }
    };

    const loadAnalytics = async (ids = []) => {
        try {
            const params = ids.length > 0 ? { proposalIds: ids.join(',') } : {};
            const res = await api.get('/api/nicolazzi/analytics', { params });
            setAnalytics(res.data);
        } catch (err) {
            console.error('Failed to load analytics', err);
        }
    };

    const handleResetAllMatchings = async () => {
        if (!confirm("⚠️ ATENÇÃO: Esta ação irá APAGAR todos os matchings efetuados e re-processar todas as faturas detetadas. Deseja continuar?")) {
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/nicolazzi/reconciliation/reset');
            alert('Reset concluído com sucesso. O sistema está a atualizar os dados.');
            loadReport();
        } catch (err) {
            alert('Erro ao fazer reset: ' + err.message);
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

                    <button
                        onClick={handleResetAllMatchings}
                        className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-800/40 rounded text-[10px] font-black uppercase transition-all"
                        title="Apagar e refazer todos os matchings de faturas"
                    >
                        Reset Matchings
                    </button>

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
                    <RotatingAnalyticsCard
                        label="Logística (Atrasos)"
                        project={{ sale: { net: 0 }, cost: { net: 0 }, margin: { net: 0 } }}
                        realized={{
                            sale: { net: analytics.logistics.lateItemsCurrent },
                            cost: { net: analytics.logistics.totalItemsPending },
                            margin: { net: 0, percent: parseFloat(analytics.logistics.latePercentage) }
                        }}
                    />

                    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 flex flex-col justify-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Lead Time Médio</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-bold font-mono text-white">{analytics.logistics.avgLeadTimeDays}</span>
                            <span className="text-xs text-gray-400">dias reais</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1">Média até entrega</span>
                    </div>

                    <RotatingAnalyticsCard
                        label="Volume do Projeto"
                        project={analytics.project}
                        realized={analytics.project}
                    />

                    <RotatingAnalyticsCard
                        label="Rentabilidade Real (Matched)"
                        project={analytics.project}
                        realized={analytics.realized}
                    />
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
