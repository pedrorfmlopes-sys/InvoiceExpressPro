import React from 'react';
import { GlassCard } from '../ui/GlassCard';

export const BackupDataViewer = ({ snapshot, onClose, onRestore }) => {
    if (!snapshot) return null;

    // 1. Data Normalization for View (Similar to nicolazziUtils but self-contained)
    const data = {
        docNumber: snapshot.docNumber || '---',
        date: snapshot.date || '---',
        project: snapshot.project || '---',
        supplier: snapshot.supplier || snapshot.entities?.supplier?.name || 'NICOLAZZI S.p.A.',
        supplierAddress: snapshot.entities?.supplier?.address || '',
        customer: snapshot.entities?.customer?.name || '',
        customerAddress: snapshot.entities?.customer?.address || '',
        shippingAddress: snapshot.entities?.shipping?.address || '',
        lines: (snapshot.lines || []).map(l => ({
            ...l,
            discountPercent: l.discountPercent || l.discountText || '0'
        })),
        totals: {
            net: snapshot.totals?.net || snapshot.totals?.goods || snapshot.totals?.subtotal || '0.00',
            vat: snapshot.totals?.vat || snapshot.totals?.tax || '0.00',
            transport: snapshot.totals?.transport || '0.00',
            gross: snapshot.totals?.gross || snapshot.totals?.total || snapshot.total || '0.00'
        }
    };

    // Phase 30: UI Labels
    const projectDisplay = snapshot.projectRef || snapshot.customerRef || (Array.isArray(snapshot.docRefs) ? snapshot.docRefs[0] : (snapshot.docRefs?.customerRef)) || snapshot.project || '---';

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300 p-4 font-sans text-xs">
            <GlassCard className="max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden border border-amber-500/30 shadow-2xl shadow-amber-500/10">

                {/* 1. TOP TOOLBAR (Isolamento Visual) */}
                <div className="h-12 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <h2 className="text-amber-500 font-bold tracking-widest flex items-center gap-3">
                            <span className="text-xl">🛡️</span>
                            <span>BACKUP PREVIEW MODE</span>
                            <span className="opacity-30">|</span>
                            <span className="text-white font-mono">{data.docNumber}</span>
                        </h2>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-200 rounded text-[10px] font-bold border border-amber-500/30">
                            READ-ONLY SNAPSHOT
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {onRestore && (
                            <button
                                onClick={onRestore}
                                className="px-4 py-1.5 bg-amber-500 text-black font-black uppercase tracking-tighter rounded shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <span>🔄</span> Restaurar Versão
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold border border-white/20 rounded transition-all active:scale-95"
                        >
                            ✕ Sair do Preview
                        </button>
                    </div>
                </div>

                {/* 2. MAIN COCKPIT AREA */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">

                    {/* B1. ENTITY QUADRANTS (Rich Layout) */}
                    <div className="p-4 grid grid-cols-4 gap-4 border-b border-white/5 bg-white/5">

                        {/* Q1: SUPPLIER */}
                        <div className="border border-white/10 rounded p-3 bg-black/40 relative group">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-amber-500/70 font-bold uppercase tracking-wider">Fornecedor</label>
                            <div className="text-sm font-bold text-white mb-1">{data.supplier}</div>
                            <div className="text-[10px] text-gray-500 leading-tight whitespace-pre-wrap h-12 overflow-hidden italic">
                                {data.supplierAddress || 'Endereço não disponível no snapshot'}
                            </div>
                        </div>

                        {/* Q2: CUSTOMER */}
                        <div className="border border-white/10 rounded p-3 bg-black/40 relative group">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-400 font-bold uppercase tracking-wider">Cliente / Bill To</label>
                            <div className="text-sm font-bold text-blue-100 mb-1">{data.customer || 'N/A'}</div>
                            <div className="text-[10px] text-gray-400 leading-tight whitespace-pre-wrap h-12 overflow-hidden">
                                {data.customerAddress || '---'}
                            </div>
                        </div>

                        {/* Q3: SHIPPING */}
                        <div className="border border-white/10 rounded p-3 bg-black/40 relative group">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-green-500 font-bold uppercase tracking-wider">Entrega / Ship To</label>
                            <div className="text-[10px] text-gray-400 leading-tight whitespace-pre-wrap h-[68px] overflow-hidden leading-relaxed italic">
                                {data.shippingAddress || 'Mesma do Cliente'}
                            </div>
                        </div>

                        {/* Q4: PROJECT & META */}
                        <div className="border border-white/10 rounded p-3 bg-black/40 relative group flex flex-col gap-2">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-amber-500 font-bold uppercase tracking-wider">Meta & Snapshot</label>
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-500 uppercase">Doc Nº</span>
                                <span className="font-mono text-amber-500 font-bold">{data.docNumber}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-500 uppercase">Data</span>
                                <span className="font-mono text-gray-300">{data.date}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-500 uppercase">PROJECT</span>
                                <span className="text-gray-400 font-bold">{projectDisplay}</span>
                            </div>
                        </div>
                    </div>

                    {/* B2. ITEMS GRID (Digital Twin Style) */}
                    <div className="flex-1 overflow-auto custom-scrollbar bg-black/20">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-white/10 text-[9px] uppercase text-gray-400 font-black sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th className="p-3 w-10 text-center border-r border-white/5">#</th>
                                    <th className="p-3 w-40 border-r border-white/5">SKU / Code</th>
                                    <th className="p-3 border-r border-white/5">Descrição do Artigo</th>
                                    <th className="p-3 w-16 text-center border-r border-white/5">Qtd</th>
                                    <th className="p-3 w-32 text-right border-r border-white/5">Preço Unit.</th>
                                    <th className="p-3 w-20 text-center border-r border-white/5">Desc%</th>
                                    <th className="p-3 w-40 text-right bg-white/5 text-amber-500 font-bold">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.lines.length > 0 ? data.lines.map((line, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-3 text-center text-gray-600 border-r border-white/5 font-mono">{idx + 1}</td>
                                        <td className="p-3 border-r border-white/5 text-amber-200 font-mono font-bold">{line.code || line.sku || '---'}</td>
                                        <td className="p-3 border-r border-white/5 text-gray-300 text-[11px] leading-snug">{line.description || 'N/A'}</td>
                                        <td className="p-3 text-center border-r border-white/5 text-blue-300 font-bold">{line.quantity || '0'}</td>
                                        <td className="p-3 text-right border-r border-white/5 font-mono text-gray-400">{line.unitPrice} €</td>
                                        <td className="p-3 text-center border-r border-white/5 text-red-400 font-bold">{line.discountPercent || '0'}%</td>
                                        <td className="p-3 text-right font-mono font-bold text-amber-500 bg-amber-500/5">
                                            {line.total} €
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" className="p-20 text-center text-gray-600 italic text-sm">
                                            Nenhum artigo encontrado no snapshot original.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* B3. FINANCIAL SUMMARY */}
                    <div className="h-16 bg-black border-t border-amber-500/20 flex items-center justify-between px-8 shrink-0">
                        <div className="text-[10px] text-amber-500/50 italic flex items-center gap-2">
                            <span className="text-lg">⚠️</span>
                            Esta é uma visualização de leitura. Edições manuais não são permitidas neste modo.
                        </div>
                        <div className="flex items-center gap-10">
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] uppercase font-black text-gray-600">Subtotal</span>
                                <span className="font-mono text-gray-400 text-sm">{data.totals.net} €</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] uppercase font-black text-gray-600">Portes / IVA</span>
                                <span className="font-mono text-gray-400 text-sm">
                                    {parseFloat((parseFloat(data.totals.transport || 0) + parseFloat(data.totals.vat || 0)) || 0).toFixed(2)} €
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] uppercase font-black text-amber-600 tracking-wider">Total Final</span>
                                <span className="font-mono text-2xl font-black text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                                    {data.totals.gross} €
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </GlassCard>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.2); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(245, 158, 11, 0.4); }
            ` }} />
        </div>
    );
};
