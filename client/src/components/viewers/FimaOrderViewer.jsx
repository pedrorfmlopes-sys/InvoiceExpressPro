import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

/**
 * FimaOrderViewer (Pure Presenter)
 * FIMA Carlo Frattini — CONFIRMACION PEDIDO
 */
export default function FimaOrderViewer({ doc, data, loading, saving, pdfUrl, onDataChange, onSave, onClose, onFinalize, onReconcile, mode }) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [itemFilter, setItemFilter] = useState('');

    const safeData = data || { lines: [], totals: {}, metadata: {}, entities: {} };
    const meta = safeData.metadata || {};
    const lines = safeData.lines || [];
    const filteredLines = lines.filter(l =>
        (l.sku || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    const updateMeta = (field, val) => onDataChange({ ...safeData, metadata: { ...meta, [field]: val } });
    const updateEntity = (type, field, val) => {
        const entities = { ...(safeData.entities || {}) };
        entities[type] = { ...(entities[type] || {}), [field]: val };
        onDataChange({ ...safeData, entities });
    };
    const updateLine = (idx, field, val) => {
        const ls = [...lines];
        ls[idx] = { ...ls[idx], [field]: val };
        if (['quantity', 'unitPrice', 'discount1', 'discount2'].includes(field)) {
            const l = ls[idx];
            const qty = parseFloat(l.quantity) || 0;
            const p = parseFloat(l.unitPrice) || 0;
            const d1 = parseFloat(l.discount1) || 0;
            const d2 = parseFloat(l.discount2) || 0;
            ls[idx].total = (qty * p * (1 - d1 / 100) * (1 - d2 / 100)).toFixed(2);
        }
        const net = ls.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
        const totals = { ...safeData.totals, net: net.toFixed(2), gross: net.toFixed(2), total: net.toFixed(2) };
        onDataChange({ ...safeData, lines: ls, totals });
    };

    const handleReProcess = async () => {
        if (!confirm('Apagar edições e reler o PDF original?')) return;
        try {
            setReprocessing(true);
            const res = await api.post(`/api/reprocess/${doc.id}?project=${doc.project || 'default'}`);
            onDataChange(res.data?.rawJson || {});
        } catch (err) { alert('Erro: ' + (err.response?.data?.error || err.message)); }
        finally { setReprocessing(false); }
    };

    if (!doc) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">

            {/* TOP TOOLBAR */}
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-red-400">FIMA</span>
                        <span className="opacity-30">|</span>
                        <span className="text-orange-400">C.PEDIDO</span>
                        <span className="opacity-30">|</span>
                        {meta.doc_number || 'SEM NÚMERO'}
                        {meta.doc_date && <span className="text-gray-500 font-normal ml-2">{meta.doc_date}</span>}
                    </h2>
                    {saving && <span className="text-[10px] text-blue-400 animate-pulse">A GRAVAR...</span>}
                </div>
                <div className="flex gap-2">
                    {mode === 'staging' && (
                        <button onClick={handleReProcess} disabled={reprocessing}
                            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors">
                            {reprocessing ? '⚙️' : '🔄'} Refazer Releitura
                        </button>
                    )}
                    <button onClick={() => setShowPdf(!showPdf)}
                        className={`px-3 py-1 rounded border border-gray-600 transition-colors ${showPdf ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                        {showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
                    </button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded">✕ Fechar</button>
                </div>
            </div>

            {/* MAIN */}
            <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
                {loading && (
                    <div className="absolute inset-0 z-[6000] bg-black/50 flex items-center justify-center">
                        <div className="text-white animate-pulse font-bold">A CARREGAR...</div>
                    </div>
                )}

                {showPdf && (
                    <div className="h-[30vh] shrink-0 bg-[#0f0f0f] border-b-4 border-[#111]">
                        {pdfUrl
                            ? <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF" />
                            : <div className="flex items-center justify-center h-full text-gray-600 animate-pulse">A carregar PDF...</div>}
                    </div>
                )}

                <div className="flex-1 bg-[#121212] text-gray-300 flex flex-col overflow-hidden min-h-0">

                    {/* HEADER QUADRANTS */}
                    <div className="p-3 grid grid-cols-4 gap-3 border-b border-[#333] bg-[#1a1a1a]">

                        {/* Q1: SUPPLIER + SHIP TO */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase">Fornecedor</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-gray-200" value="FIMA Carlo Frattini spa" disabled />
                            <div className="border-t border-[#333] mt-2 pt-2">
                                <label className="text-[9px] text-green-600 font-bold uppercase block mb-1">📦 Destino / Ship To</label>
                                <input className="w-full bg-transparent border-none outline-none font-bold text-green-300"
                                    value={safeData.entities?.shipping?.name || ''}
                                    onChange={e => updateEntity('shipping', 'name', e.target.value)}
                                    placeholder="Nome envio..." />
                                <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-green-500/70 h-10 resize-none mt-1 custom-scrollbar"
                                    value={safeData.entities?.shipping?.address || ''}
                                    onChange={e => updateEntity('shipping', 'address', e.target.value)}
                                    placeholder="Morada destino..." />
                            </div>
                        </div>

                        {/* Q2: CUSTOMER */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-500 font-bold uppercase">Cliente / Bill To</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-blue-100"
                                value={safeData.entities?.customer?.name || ''}
                                onChange={e => updateEntity('customer', 'name', e.target.value)}
                                placeholder="Nome do cliente" />
                            <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-8 resize-none mt-1 custom-scrollbar"
                                value={safeData.entities?.customer?.address || ''}
                                onChange={e => updateEntity('customer', 'address', e.target.value)}
                                placeholder="Morada fiscal..." />
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#333]">
                                <span className="text-[9px] text-blue-500 font-bold uppercase">NIF</span>
                                <input className="flex-1 bg-transparent border-none outline-none font-bold text-gray-300"
                                    value={meta.customer_vat || ''}
                                    onChange={e => updateMeta('customer_vat', e.target.value)}
                                    placeholder="NIF..." />
                            </div>
                        </div>

                        {/* Q3: DOC META */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase">Doc Meta</label>
                            {[
                                ['Doc Nº', 'doc_number', 'text-yellow-500 font-bold'],
                                ['Data', 'doc_date', 'text-gray-300'],
                                ['Expedição', 'expedition_week', 'text-orange-400'],
                                ['Cond. Pag.', 'payment_condition', 'text-gray-400'],
                            ].map(([label, key, cls]) => (
                                <div key={key} className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0">{label}</span>
                                    <input className={`flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono rounded outline-none h-5 text-[10px] ${cls}`}
                                        value={meta[key] || ''} onChange={e => updateMeta(key, e.target.value)} />
                                </div>
                            ))}
                        </div>

                        {/* Q4: REFERENCES */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-purple-400 font-bold uppercase">Referências</label>
                            {[
                                ['Ref. Cliente', 'client_ref', 'text-yellow-500'],
                                ['Projeto', 'project_note', 'text-blue-300'],
                                ['Envio', 'shipping_method', 'text-gray-400'],
                                ['Porto', 'shipping_terms', 'text-gray-400'],
                            ].map(([label, key, cls]) => (
                                <div key={key} className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0">{label}</span>
                                    <input className={`flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono rounded outline-none h-5 text-[10px] ${cls}`}
                                        value={meta[key] || ''} onChange={e => updateMeta(key, e.target.value)} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FILTER */}
                    <div className="px-4 py-1 bg-[#161616] border-b border-[#2a2a2a] flex items-center gap-3">
                        <span className="text-[9px] text-gray-600 uppercase">Filtrar</span>
                        <input className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] px-2 py-0.5 text-[10px] text-gray-300 rounded outline-none"
                            placeholder="SKU ou descrição..." value={itemFilter} onChange={e => setItemFilter(e.target.value)} />
                        <span className="text-[9px] text-gray-600">{filteredLines.length}/{lines.length}</span>
                    </div>

                    {/* LINE ITEMS TABLE */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#1f1f1f] text-[10px] uppercase text-gray-500 font-bold sticky top-0 z-10">
                                <tr>
                                    <th className="p-2 w-8 text-center border-r border-[#333]">#</th>
                                    <th className="p-2 w-36 border-r border-[#333]">SKU</th>
                                    <th className="p-2 border-r border-[#333]">Descrição</th>
                                    <th className="p-2 w-14 text-center border-r border-[#333]">Qtd</th>
                                    <th className="p-2 w-24 text-right border-r border-[#333]">P.Unit</th>
                                    <th className="p-2 w-14 text-center text-red-500 border-r border-[#333]">Desc1%</th>
                                    <th className="p-2 w-14 text-center text-red-400 border-r border-[#333]">Desc2%</th>
                                    <th className="p-2 w-28 text-right bg-[#252525] text-gray-300">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222]">
                                {filteredLines.map((line, idx) => (
                                    <tr key={idx} className="group hover:bg-[#1a1a1a]">
                                        <td className="p-2 text-center text-gray-600 border-r border-[#222]">{idx + 1}</td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-1.5 outline-none text-red-400 font-mono font-bold focus:bg-[#222]"
                                                value={line.sku || ''} onChange={e => updateLine(idx, 'sku', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-1.5 outline-none text-gray-300 focus:bg-[#222]"
                                                value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-1.5 outline-none text-center text-blue-300 font-bold focus:bg-[#222]"
                                                value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-1.5 outline-none text-right font-mono text-gray-400 focus:bg-[#222]"
                                                value={line.unitPrice ?? ''} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-1.5 outline-none text-center text-red-400 focus:bg-[#222]"
                                                value={line.discount1 ?? ''} onChange={e => updateLine(idx, 'discount1', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-1.5 outline-none text-center text-red-300 focus:bg-[#222]"
                                                value={line.discount2 ?? ''} onChange={e => updateLine(idx, 'discount2', e.target.value)} />
                                        </td>
                                        <td className="p-2 text-right font-mono font-bold text-gray-200 bg-[#151515]">
                                            {parseFloat(line.total || 0).toFixed(2)} €
                                        </td>
                                    </tr>
                                ))}
                                {filteredLines.length === 0 && (
                                    <tr><td colSpan="8" className="p-12 text-center text-gray-600 italic">Nenhum artigo encontrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* FOOTER */}
                    <div className="h-14 bg-[#161616] border-t border-[#333] flex items-center justify-between px-6">
                        <div className="w-1/3">
                            <input className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 italic"
                                placeholder="Notas internas..." value={safeData.notes || ''} onChange={e => onDataChange({ ...safeData, notes: e.target.value })} />
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase text-gray-600 font-bold">Total Pedido</span>
                                <span className="font-mono text-xl font-bold text-red-400">{safeData.totals?.gross || '0.00'} €</span>
                            </div>
                            <div className="flex gap-2">
                                <button className="px-4 py-2 bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded hover:bg-blue-900/60"
                                    onClick={() => onSave(safeData)} disabled={saving}>
                                    💾 {saving ? 'A gravar...' : 'Guardar'}
                                </button>
                                {onReconcile && (
                                    <button className="px-4 py-2 bg-green-900/40 text-green-400 border border-green-800/50 rounded hover:bg-green-900/60 flex items-center gap-1"
                                        onClick={onReconcile}>
                                        🔗 Ligar à Proposta
                                    </button>
                                )}
                                {mode === 'staging' && (
                                    <button className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-2 rounded"
                                        onClick={() => onFinalize(safeData)}>✔ FINALIZAR</button>
                                )}
                                {mode === 'archive' && (
                                    <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2 rounded"
                                        onClick={onClose}>✔ FECHAR</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
        </div>,
        document.body
    );
}

const scrollbarStyles = `
.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #121212; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
`;
