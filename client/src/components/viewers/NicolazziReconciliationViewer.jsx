import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

export default function NicolazziReconciliationViewer({ invoiceId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDetails();
    }, [invoiceId]);

    const fetchDetails = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/nicolazzi/reconcile/${invoiceId}/details`);
            setData(res.data);
        } catch (err) {
            setError(err.message || 'Erro ao carregar detalhes');
        } finally {
            setLoading(false);
        }
    };

    if (!invoiceId) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[8000] bg-black/95 flex flex-col font-sans text-xs w-screen h-screen">

            {/* TOOLBAR */}
            <div className="h-12 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-6 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2 text-sm">
                        <span className="text-indigo-500">RECONCILIATION VIEWER</span>
                        <span className="opacity-30">|</span>
                        {data?.invoice?.number || 'Inv ???'}
                        <span className="opacity-30">➜</span>
                        {data?.proposal?.number || data?.invoice?.shipping_mark || 'Searching...'}
                    </h2>
                </div>
                <button onClick={onClose} className="px-4 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded transition-colors uppercase font-bold text-[10px]">
                    ✕ Fechar
                </button>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-auto bg-[#121212] p-8 custom-scrollbar relative">

                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center text-indigo-400 animate-pulse font-bold text-lg">
                        A carregar dados de reconciliação...
                    </div>
                )}

                {error && (
                    <div className="p-8 border border-red-800 bg-red-900/10 text-red-400 rounded-lg text-center">
                        {error}
                    </div>
                )}

                {data && !loading && (
                    <div className="max-w-7xl mx-auto flex flex-col gap-8">

                        {/* 1. HEADER METRICS */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-[#1a1a1a] p-4 rounded border border-[#333] flex flex-col relative overflow-hidden">
                                <span className="text-[10px] uppercase text-gray-500 font-bold">Total Fatura (Linhas)</span>
                                <span className="text-2xl font-bold text-white mt-1">{data.stats.total_inv}</span>
                                <div className="absolute top-0 right-0 p-2 opacity-10 text-4xl font-black">#</div>
                            </div>
                            <div className="bg-[#1a1a1a] p-4 rounded border border-[#333] flex flex-col relative overflow-hidden">
                                <span className="text-[10px] uppercase text-green-500 font-bold">Matches (100%)</span>
                                <span className="text-2xl font-bold text-green-400 mt-1">{data.stats.matched}</span>
                                <div className="absolute top-0 right-0 p-2 opacity-10 bg-green-500 rounded-full w-12 h-12 -mr-4 -mt-4"></div>
                            </div>
                            <div className="bg-[#1a1a1a] p-4 rounded border border-[#333] flex flex-col relative overflow-hidden">
                                <span className="text-[10px] uppercase text-yellow-500 font-bold">Potenciais (Soft Match)</span>
                                <span className="text-2xl font-bold text-yellow-400 mt-1">{data.stats.potential || 0}</span>
                            </div>
                            <div className="bg-[#1a1a1a] p-4 rounded border border-[#333] flex flex-col relative overflow-hidden">
                                <span className="text-[10px] uppercase text-red-500 font-bold">Não Encontrados</span>
                                <span className="text-2xl font-bold text-red-400 mt-1">
                                    {(data.stats.total_inv - data.stats.matched - (data.stats.potential || 0))}
                                </span>
                            </div>
                        </div>

                        {data.linked === false && (
                            <div className="bg-yellow-900/20 border border-yellow-700/50 p-6 rounded-lg text-center text-yellow-200">
                                <h3 className="font-bold text-lg mb-2">⚠ Nenhuma Proposta Associada</h3>
                                <p className="text-gray-400 mb-4">Esta fatura ainda não foi reconciliada formalmente.</p>
                                <p className="text-sm">Shipping Mark na Fatura: <span className="font-mono text-white bg-black/30 px-2 py-1 rounded">{data.invoice.shipping_mark || 'N/A'}</span></p>
                            </div>
                        )}

                        {/* 2. DETAIL TABLE */}
                        <div className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
                            <div className="p-4 bg-[#202020] border-b border-[#333] flex justify-between items-center">
                                <h3 className="font-bold text-gray-300">Detalhe Linha-a-Linha</h3>
                                {data.linked && (
                                    <span className="text-xs text-gray-500">
                                        Proposta: <span className="text-indigo-400 font-bold">{data.proposal.name} ({data.proposal.number})</span>
                                    </span>
                                )}
                            </div>

                            <table className="w-full text-left">
                                <thead className="bg-[#151515] text-[10px] uppercase text-gray-500 font-bold sticky top-0">
                                    <tr>
                                        <th className="p-3 w-12 text-center">#</th>
                                        <th className="p-3 w-32">Invoice SKU</th>
                                        <th className="p-3">Descrição Fatura</th>
                                        <th className="p-3 w-20 text-center">Qtd Inv</th>
                                        <th className="p-3 w-16 text-center">Status</th>
                                        <th className="p-3 w-32 text-right">Proposal SKU</th>
                                        <th className="p-3 w-20 text-center text-indigo-400">Qtd Orig</th>
                                        <th className="p-3 w-20 text-center">Delta</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#222]">
                                    {data.lines.map((line, idx) => {
                                        let statusColor = 'text-gray-600';
                                        let statusIcon = '−';
                                        let rowBg = '';

                                        if (line.status === 'matched') {
                                            statusColor = 'text-green-500';
                                            statusIcon = '✔';
                                            rowBg = 'bg-green-900/5 hover:bg-green-900/10';
                                        } else if (line.status === 'potential') {
                                            statusColor = 'text-yellow-500';
                                            statusIcon = '?';
                                        } else {
                                            statusColor = 'text-red-500';
                                            statusIcon = '⨯';
                                            rowBg = 'bg-red-900/5 hover:bg-red-900/10';
                                        }

                                        const delta = line.match_diff || 0;
                                        const deltaColor = delta > 0 ? 'text-red-400' : (delta < 0 ? 'text-yellow-400' : 'text-gray-600');
                                        const deltaSign = delta > 0 ? '+' : '';

                                        return (
                                            <tr key={idx} className={`transition-colors ${rowBg}`}>
                                                <td className="p-3 text-center text-gray-600 font-mono text-[10px]">{idx + 1}</td>

                                                {/* INVOICE SIDE */}
                                                <td className="p-3 font-mono font-bold text-gray-300">{line.invoice_line.sku}</td>
                                                <td className="p-3 text-gray-400 truncate max-w-xs" title={line.invoice_line.desc}>
                                                    {line.invoice_line.desc}
                                                </td>
                                                <td className="p-3 text-center font-bold text-white text-sm">{line.invoice_line.qty}</td>

                                                {/* STATUS */}
                                                <td className={`p-3 text-center font-bold text-lg ${statusColor}`}>
                                                    {statusIcon}
                                                </td>

                                                {/* PROPOSAL SIDE */}
                                                <td className="p-3 text-right font-mono text-gray-400">
                                                    {line.proposal_line?.sku || '-'}
                                                </td>
                                                <td className="p-3 text-center font-mono text-indigo-300">
                                                    {line.proposal_line?.original_qty ?? '-'}
                                                </td>
                                                <td className={`p-3 text-center font-bold ${deltaColor}`}>
                                                    {line.proposal_line ? `${deltaSign}${delta}` : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #121212; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
            `}} />
        </div>,
        document.body
    );
}
