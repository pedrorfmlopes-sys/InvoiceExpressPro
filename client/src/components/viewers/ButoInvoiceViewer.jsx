import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

export default function ButoInvoiceViewer({
    doc,
    data,
    loading,
    saving,
    pdfUrl,
    onDataChange,
    onSave,
    onClose,
    onFinalize,
    onReconcile,
    mode 
}) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [itemFilter, setItemFilter] = useState('');
    const [focusedSku, setFocusedSku] = useState(null);

    const handleReProcess = async () => {
        if (!confirm("Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original.")) return;
        try {
            setReprocessing(true);
            const res = await api.post(`/api/reprocess/${doc.id}?project=${doc.project || 'default'}`);
            onDataChange(res.data.rawJson || {});
            alert("Releitura efetuada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao reprocessar: " + (err.response?.data?.error || err.message));
        } finally {
            setReprocessing(false);
        }
    };

    const handleSkuFocus = (idx, val) => setFocusedSku({ idx, val });
    const handleSkuBlur = async (idx, finalVal) => {
        if (!focusedSku || focusedSku.idx !== idx) return;
        const original = focusedSku.val;
        if (original && finalVal && original !== finalVal) {
            if (window.confirm(`Memorizar correção de código para BUTO?\n${original} -> ${finalVal}`)) {
                try {
                    await api.post('/api/catalog/aliases', { brand: 'BUTO', originalSku: original, correctedSku: finalVal });
                } catch (err) { console.error(err); }
            }
        }
        setFocusedSku(null);
    };

    const updateHeader = (field, val) => onDataChange({ ...data, [field]: val });
    const updateEntity = (entityType, field, val) => {
        const entities = { ...(data.entities || {}) };
        entities[entityType] = { ...(entities[entityType] || {}), [field]: val };
        onDataChange({ ...data, entities });
    };

    const updateLine = (idx, field, val) => {
        const lines = [...(data.lines || [])];
        const line = { ...lines[idx], [field]: val };
        
        if (['quantity', 'unitPrice', 'discountPercent', 'incrementPercent', 'basePrice'].includes(field)) {
            const qty = parseFloat(line.quantity) || 0;
            const bPrice = parseFloat(line.basePrice || line.unitPrice) || 0;
            const inc = parseFloat(line.incrementPercent) || 0;
            const disc = parseFloat(String(line.discountPercent || '0').replace(',', '.')) || 0;
            
            const priceWithInc = bPrice * (1 + inc / 100);
            line.unitPrice = priceWithInc;
            line.total = parseFloat((qty * priceWithInc * (1 - disc / 100)) || 0).toFixed(2);
        }
        
        lines[idx] = line;
        const net = lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const totals = { ...data.totals, subtotal: net.toFixed(2), total: net.toFixed(2) };
        onDataChange({ ...data, lines, totals });
    };

    if (!doc) return null;
    const safeData = data || { lines: [], totals: {}, entities: {} };
    const filteredLines = (safeData.lines || []).filter(l =>
        (l.code || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/95 flex flex-col font-sans text-xs w-screen h-screen overflow-hidden">
            {/* TOOLBAR */}
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 shrink-0 shadow-lg">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-yellow-500 font-black italic uppercase">Butö Invoice</span>
                        <span className="opacity-30">|</span>
                        {safeData.docNumber || 'NOVO DOC'}
                    </h2>
                    {loading && <span className="text-blue-400 animate-pulse font-bold text-[10px]">A REPROCESSAR...</span>}
                </div>
                <div className="flex gap-2">
                    {mode === 'staging' && (
                        <button onClick={handleReProcess} disabled={reprocessing} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors flex items-center gap-2 outline-none active:scale-95 shadow-md">
                            <span>{reprocessing ? '⚙️' : '🔄'}</span> Refazer Releitura
                        </button>
                    )}
                    <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1 rounded border border-gray-600 transition-all ${showPdf ? 'bg-red-900/20 text-red-500 border-red-900/50' : 'bg-gray-800 text-gray-400'}`}>
                        {showPdf ? 'Ocultar PDF' : 'Ver PDF'}
                    </button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 hover:bg-red-800/40 text-red-500 border border-red-900/50 rounded transition-colors font-bold">
                        ✕ Fechar
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
                {showPdf && (
                    <div className="h-[30vh] shrink-0 bg-[#0f0f0f] border-b-4 border-[#111] relative shadow-2xl z-10">
                        <iframe src={pdfUrl} className="w-full h-full border-none grayscale hover:grayscale-0 transition-all duration-500" title="PDF Source"></iframe>
                    </div>
                )}

                <div className="h-[calc(70vh-40px)] w-full bg-[#121212] text-gray-300 flex flex-col overflow-hidden min-h-0">
                    {/* QUADRANTS */}
                    <div className="p-4 grid grid-cols-4 gap-3 border-b border-[#333] bg-[#1a1a1a]">
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative flex flex-col">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">Fornecedor</label>
                            <div className="font-bold text-gray-200">BUTO DESIGN S.L.</div>
                            <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">Alicante, Spain. B02883957</div>
                        </div>

                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative flex flex-col">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-red-400 font-bold uppercase tracking-wider">Cliente / Faturar A</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-red-100 placeholder-white/10"
                                value={safeData.entities?.customer?.name || ''} onChange={e => updateEntity('customer', 'name', e.target.value)} />
                            <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 h-8 resize-none mt-1"
                                value={safeData.entities?.customer?.address || ''} onChange={e => updateEntity('customer', 'address', e.target.value)} />
                        </div>

                        <div className="col-span-2 border border-[#333] rounded p-2 bg-[#151515] relative grid grid-cols-2 gap-3">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase tracking-wider">Metadados</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-600 uppercase w-12 shrink-0">Doc Nº</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-yellow-500 font-bold rounded focus:border-red-500 outline-none h-6"
                                        value={safeData.docNumber || ''} onChange={e => updateHeader('docNumber', e.target.value)} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-600 uppercase w-12 shrink-0">Data</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-gray-300 rounded focus:border-red-500 outline-none h-6"
                                        value={safeData.dates?.issued || ''} onChange={e => updateHeader('issued', e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-600 uppercase w-16 shrink-0 leading-tight">Expedição</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right text-[10px] text-yellow-500/80 rounded focus:border-red-500 outline-none h-6 uppercase font-bold"
                                        value={safeData.shippingMarks || ''} onChange={e => updateHeader('shippingMarks', e.target.value)} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-600 uppercase w-16 shrink-0">NIF Cli.</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-gray-400 rounded focus:border-red-500 outline-none h-6"
                                        value={safeData.entities?.customer?.vat || ''} onChange={e => updateEntity('customer', 'vat', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* GRID */}
                    <div className="flex-1 overflow-auto bg-[#121212] custom-scrollbar p-0 relative">
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead className="bg-[#1f1f1f] text-[9px] uppercase text-gray-500 font-bold sticky top-0 z-10 shadow-sm tracking-wider">
                                <tr>
                                    <th className="p-2 w-10 text-center border-r border-[#333]">#</th>
                                    <th className="p-2 w-14 text-center border-r border-[#333]">UD.</th>
                                    <th className="p-2 w-32 border-r border-[#333]">COD. (SKU)</th>
                                    <th className="p-2 border-r border-[#333]">DESCRIPCIÓN</th>
                                    <th className="p-2 w-20 text-center border-r border-[#333]">DETALLE</th>
                                    <th className="p-2 w-16 text-center border-r border-[#333]">ACABADO</th>
                                    <th className="p-2 w-24 text-right border-r border-[#333]">PRECIO (€)</th>
                                    <th className="p-2 w-14 text-center border-r border-[#333] text-yellow-500/60">%INC.</th>
                                    <th className="p-2 w-14 text-center border-r border-[#333] text-red-500/60">%DTO.</th>
                                    <th className="p-2 w-28 text-right bg-[#252525] text-yellow-500 font-black">SUBTOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222]">
                                {filteredLines.map((line, idx) => (
                                    <tr key={idx} className="group hover:bg-[#1a1a1a] transition-colors">
                                        <td className="p-2 text-center text-gray-800 border-r border-[#222] font-mono text-[9px]">{idx + 1}</td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-2 outline-none text-center text-blue-300 font-bold focus:bg-[#222]"
                                                value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-yellow-500 font-mono font-bold focus:bg-red-500/10 uppercase"
                                                value={line.code || ''} onChange={e => updateLine(idx, 'code', e.target.value)}
                                                onFocus={() => handleSkuFocus(idx, line.code)} onBlur={(e) => handleSkuBlur(idx, e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-gray-300 focus:text-white truncate font-medium"
                                                value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent text-center outline-none text-gray-500 font-mono text-[10px] uppercase focus:bg-[#222]"
                                                value={line.detailCode || ''} onChange={e => updateLine(idx, 'detailCode', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent text-center outline-none text-indigo-400 font-mono text-[10px] uppercase font-bold focus:bg-[#222]"
                                                value={line.finishCode || ''} onChange={e => updateLine(idx, 'finishCode', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-right font-mono text-gray-400 focus:bg-[#222]"
                                                value={line.basePrice || line.unitPrice || ''} onChange={e => updateLine(idx, 'basePrice', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent text-center outline-none text-yellow-600/60 font-mono focus:bg-[#222]"
                                                value={line.incrementPercent || '0'} onChange={e => updateLine(idx, 'incrementPercent', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent text-center outline-none text-red-500/40 font-mono focus:bg-[#222]"
                                                value={line.discountPercent || '0'} onChange={e => updateLine(idx, 'discountPercent', e.target.value)} />
                                        </td>
                                        <td className="p-2 text-right font-mono font-black text-gray-200 bg-[#151515] group-hover:bg-[#1a1a1a] tabular-nums shadow-inner">
                                            {line.total || 0} €
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* FOOTER */}
                    <div className="h-16 bg-[#161616] border-t border-[#333] flex items-center justify-between px-6 shadow-2xl z-20 shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end border-r border-white/5 pr-6">
                                <span className="text-[9px] uppercase font-bold text-gray-600">Base Mercadorias</span>
                                <span className="font-mono text-gray-400 text-sm font-bold">{safeData.totals?.subtotal || '0.00'} €</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase font-black text-gray-600 tracking-widest">Total Líquido</span>
                                <span className="font-mono text-2xl font-black text-yellow-500 tabular-nums drop-shadow-[0_0_15px_rgba(234,179,8,0.2)]">{safeData.totals?.total || '0.00'} €</span>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button className="px-5 py-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:text-white transition-all font-bold uppercase text-[10px] tracking-widest active:scale-95 shadow-lg shadow-black"
                                onClick={() => onSave(safeData)} disabled={saving}>{saving ? 'A Guardar...' : 'Guardar'}</button>

                            {mode === 'staging' && (
                                <>
                                    <button className="px-5 py-2 bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded-lg hover:bg-blue-900/60 transition-all font-black uppercase text-[10px] tracking-widest active:scale-95 flex items-center gap-2"
                                        onClick={onReconcile}>🔗 Ligar Proposta</button>
                                    <button className="px-8 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg shadow-lg transition-transform active:scale-95 font-black uppercase text-[10px] tracking-widest"
                                        onClick={() => onFinalize(safeData)}>✔ Finalizar</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: #121212; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #dc2626; }` }} />
        </div>,
        document.body
    );
}
