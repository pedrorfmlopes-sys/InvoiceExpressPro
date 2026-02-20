import React, { useEffect, useState } from 'react';
import api from '../api/apiClient';
import ProposalFulfillmentViewer from '../components/viewers/ProposalFulfillmentViewer';

export default function ReconciliationTab() {
    const [report, setReport] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedProposalId, setSelectedProposalId] = useState(null);

    // Initial Load
    useEffect(() => {
        loadReport();
    }, []);

    const loadReport = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/nicolazzi/report');
            setReport(res.data || []);
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

    return (
        <div className="h-full flex flex-col bg-[#121212] text-gray-300 p-6 overflow-hidden">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Relatório de Reconciliação</h1>
                    <p className="text-sm text-gray-500 mt-1">Gestão de Fornecimento (Nicolazzi)</p>
                </div>
                <button onClick={loadReport} className="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#444] rounded text-sm transition-colors">
                    ↻ Atualizar
                </button>
            </div>

            {/* TABLE CONTAINER */}
            <div className="flex-1 overflow-auto border border-[#333] rounded-lg bg-[#1a1a1a]">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#111] text-[11px] uppercase text-gray-500 font-bold sticky top-0 z-10">
                        <tr>
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
                            <tr><td colSpan="7" className="p-10 text-center animate-pulse">A calcular dados...</td></tr>
                        ) : report.length === 0 ? (
                            <tr><td colSpan="7" className="p-10 text-center text-gray-600">Sem propostas registadas.</td></tr>
                        ) : (
                            report.map((row) => (
                                <tr key={row.id} className="hover:bg-[#222] transition-colors group">
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
        </div>
    );
}
