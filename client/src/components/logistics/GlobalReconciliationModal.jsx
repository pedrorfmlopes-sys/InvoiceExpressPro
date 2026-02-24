import React, { useEffect, useState } from 'react';
import api from '../../api/apiClient';

export default function GlobalReconciliationModal({ onClose, onReconciled }) {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        loadMatches();
    }, []);

    const loadMatches = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/nicolazzi/discover');
            setMatches(res.data || []);
        } catch (err) {
            console.error(err);
            alert('Erro ao procurar correspondências');
        } finally {
            setLoading(false);
        }
    };

    const handleReconcile = async (invoiceId) => {
        setProcessing(true);
        try {
            await api.post(`/api/nicolazzi/reconcile/${invoiceId}`);
            // Remove from list or reload
            await loadMatches();
            if (onReconciled) onReconciled();
        } catch (err) {
            alert('Falha ao reconciliar: ' + (err.response?.data?.error || err.message));
        } finally {
            setProcessing(false);
        }
    };

    const handleReconcileAll = async () => {
        const toReconcile = matches.filter(m => m.proposal);
        if (toReconcile.length === 0) return;

        if (!confirm(`Tem a certeza que deseja reconciliar ${toReconcile.length} faturas automaticamente?`)) return;

        setProcessing(true);
        let successCount = 0;
        for (const m of toReconcile) {
            try {
                await api.post(`/api/nicolazzi/reconcile/${m.invoice.id}`);
                successCount++;
            } catch (err) {
                console.error(`Erro na fatura ${m.invoice.id}`, err);
            }
        }

        alert(`Reconciliadas ${successCount} de ${toReconcile.length} faturas.`);
        await loadMatches();
        if (onReconciled) onReconciled();
        setProcessing(false);
    };

    return (
        <div className="fixed inset-0 z-[7000] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm">
            <div className="bg-[#121212] border border-[#333] rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col font-sans">

                {/* HEAD */}
                <div className="p-6 border-b border-[#222] flex justify-between items-center bg-[#1a1a1a] rounded-t-xl shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                            <span className="text-indigo-500">⚡ Total Matching</span>
                            Descobridor de Faturas Pendentes
                        </h2>
                        <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-wider">
                            Faturas Nicolazzi extraídas que ainda não foram associadas a propostas
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {matches.some(m => m.proposal) && (
                            <button
                                disabled={processing}
                                onClick={handleReconcileAll}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-sm transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                            >
                                Reconciliar Todos os Matches
                            </button>
                        )}
                        <button
                            disabled={processing}
                            onClick={onClose}
                            className="px-5 py-2 bg-[#222] hover:bg-[#333] text-gray-300 font-bold rounded-lg text-sm border border-[#444] transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-auto bg-[#0a0a0a] p-6 relative custom-scrollbar">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center text-indigo-400 animate-pulse font-bold tracking-widest uppercase">
                            A pesquisar documentos...
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <div className="text-4xl mb-4 opacity-50">🎉</div>
                            <h3 className="text-lg font-bold text-gray-400 mb-1">Tudo em dia!</h3>
                            <p className="text-sm">Não existem faturas pendentes de reconciliação para a Nicolazzi.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {matches.map((m, idx) => (
                                <div key={m.invoice.id} className="bg-[#1a1a1a] border border-[#333] rounded-lg p-5 flex items-center justify-between hover:border-[#555] transition-colors">
                                    <div className="flex items-center gap-8 flex-1">

                                        {/* INVOICE INFO */}
                                        <div className="flex flex-col gap-1 min-w-[300px]">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Fatura Extraída</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-lg font-bold text-gray-200">{m.invoice.number}</span>
                                                <span className="text-xs text-gray-500">{new Date(m.invoice.date).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-mono text-gray-400 mt-1">
                                                <span>Total: €{parseFloat(m.invoice.total).toFixed(2)}</span>
                                                {m.invoice.shipping_mark && (
                                                    <span className="bg-black/40 px-2 py-0.5 rounded border border-[#333] text-indigo-300">
                                                        SM: {m.invoice.shipping_mark}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* ARROW */}
                                        <div className="text-[#333] text-2xl font-black">→</div>

                                        {/* PROPOSAL INFO (MATCH) */}
                                        <div className="flex flex-col gap-1 flex-1">
                                            {m.proposal ? (
                                                <>
                                                    <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                        Match Sugerido
                                                    </span>
                                                    <div className="text-base font-bold text-white">{m.proposal.number}</div>
                                                    <div className="text-xs text-gray-400">{m.proposal.name} {m.proposal.client_ref ? `(${m.proposal.client_ref})` : ''}</div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-[10px] text-yellow-600 font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <span className="text-xl">!</span> Não Encontrado
                                                    </span>
                                                    <div className="text-xs text-gray-500 leading-relaxed max-w-xs mt-1">
                                                        Nenhuma proposta aberta com a referência <strong>{m.invoice.shipping_mark || 'n/d'}</strong> (Shipping Mark). É necessário associar manualmente ou retificar a proposta.
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="ml-6 flex items-center gap-3">
                                        {m.proposal && (
                                            <button
                                                disabled={processing}
                                                onClick={() => handleReconcile(m.invoice.id)}
                                                className="px-4 py-2 bg-green-900/40 hover:bg-green-900/60 text-green-400 border border-green-800 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                                            >
                                                Confirmar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
