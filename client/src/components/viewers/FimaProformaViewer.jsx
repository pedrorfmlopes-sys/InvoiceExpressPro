import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

/** FimaProformaViewer — FIMA PROFORMA. Same layout as FimaOrderViewer but with IBAN and purple accent. */
export default function FimaProformaViewer({ doc, data, loading, saving, pdfUrl, onDataChange, onSave, onClose, onFinalize, mode }) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [itemFilter, setItemFilter] = useState('');

    const safeData = data || { lines: [], totals: {}, metadata: {}, entities: {} };
    const meta = safeData.metadata || {};
    const lines = safeData.lines || [];
    const filtered = lines.filter(l =>
        (l.sku || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    const updateMeta = (k, v) => onDataChange({ ...safeData, metadata: { ...meta, [k]: v } });
    const updateEntity = (t, k, v) => {
        const e = { ...(safeData.entities || {}) };
        e[t] = { ...(e[t] || {}), [k]: v };
        onDataChange({ ...safeData, entities: e });
    };
    const updateLine = (idx, field, val) => {
        const ls = [...lines]; ls[idx] = { ...ls[idx], [field]: val };
        if (['quantity', 'unitPrice', 'discount1', 'discount2'].includes(field)) {
            const l = ls[idx];
            ls[idx].total = ((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0) * (1 - (parseFloat(l.discount1) || 0) / 100) * (1 - (parseFloat(l.discount2) || 0) / 100)).toFixed(2);
        }
        const net = ls.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
        onDataChange({ ...safeData, lines: ls, totals: { ...safeData.totals, net: net.toFixed(2), gross: net.toFixed(2), total: net.toFixed(2) } });
    };

    const handleReProcess = async () => {
        if (!confirm('Apagar edições e reler o PDF original?')) return;
        try { setReprocessing(true); const r = await api.post(`/api/reprocess/${doc.id}?project=${doc.project || 'default'}`); onDataChange(r.data?.rawJson || {}); }
        catch (e) { alert('Erro: ' + (e.response?.data?.error || e.message)); } finally { setReprocessing(false); }
    };

    if (!doc) return null;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 shrink-0">
                <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                    <span className="text-red-400">FIMA</span><span className="opacity-30">|</span>
                    <span className="text-purple-400">PROFORMA</span><span className="opacity-30">|</span>
                    {meta.doc_number || 'SEM NÚMERO'}{meta.doc_date && <span className="text-gray-500 font-normal ml-2">{meta.doc_date}</span>}
                    {saving && <span className="text-[10px] text-blue-400 animate-pulse ml-3">A GRAVAR...</span>}
                </h2>
                <div className="flex gap-2">
                    {mode === 'staging' && <button onClick={handleReProcess} disabled={reprocessing} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600">{reprocessing ? '⚙️' : '🔄'} Refazer</button>}
                    <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1 rounded border border-gray-600 ${showPdf ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>{showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}</button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 text-red-500 border border-red-900/50 rounded">✕ Fechar</button>
                </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {loading && <div className="absolute inset-0 z-[6000] bg-black/50 flex items-center justify-center"><div className="text-white animate-pulse font-bold">A CARREGAR...</div></div>}
                {showPdf && <div className="h-[30vh] shrink-0 bg-[#0f0f0f] border-b-4 border-[#111]">{pdfUrl ? <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF" /> : <div className="flex items-center justify-center h-full text-gray-600 animate-pulse">A carregar PDF...</div>}</div>}
                <div className="flex-1 bg-[#121212] text-gray-300 flex flex-col overflow-hidden min-h-0">
                    <div className="p-3 grid grid-cols-4 gap-3 border-b border-[#333] bg-[#1a1a1a]">
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase">Fornecedor</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-gray-200" value="FIMA Carlo Frattini spa" disabled />
                            <div className="border-t border-[#333] mt-2 pt-2">
                                <label className="text-[9px] text-green-600 font-bold uppercase block mb-1">📦 Destino</label>
                                <input className="w-full bg-transparent border-none outline-none font-bold text-green-300" value={safeData.entities?.shipping?.name || ''} onChange={e => updateEntity('shipping', 'name', e.target.value)} placeholder="Nome envio..." />
                                <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-green-500/70 h-10 resize-none mt-1 custom-scrollbar" value={safeData.entities?.shipping?.address || ''} onChange={e => updateEntity('shipping', 'address', e.target.value)} placeholder="Morada..." />
                            </div>
                        </div>
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-500 font-bold uppercase">Cliente</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-blue-100" value={safeData.entities?.customer?.name || ''} onChange={e => updateEntity('customer', 'name', e.target.value)} />
                            <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-8 resize-none mt-1 custom-scrollbar" value={safeData.entities?.customer?.address || ''} onChange={e => updateEntity('customer', 'address', e.target.value)} />
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#333]">
                                <span className="text-[9px] text-blue-500 font-bold uppercase">NIF</span>
                                <input className="flex-1 bg-transparent border-none outline-none font-bold text-gray-300" value={meta.customer_vat || ''} onChange={e => updateMeta('customer_vat', e.target.value)} />
                            </div>
                        </div>
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase">Doc Meta</label>
                            {[['Doc Nº', 'doc_number', 'text-yellow-500 font-bold'], ['Data', 'doc_date', 'text-gray-300'], ['Cond. Pag.', 'payment_condition', 'text-gray-400'], ['IBAN', 'bank_iban', 'text-cyan-400']].map(([lbl, k, cls]) => (
                                <div key={k} className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0">{lbl}</span>
                                    <input className={`flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono rounded outline-none h-5 text-[10px] ${cls}`} value={meta[k] || ''} onChange={e => updateMeta(k, e.target.value)} />
                                </div>
                            ))}
                        </div>
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-purple-400 font-bold uppercase">Referências</label>
                            {[['Ref. Cliente', 'client_ref', 'text-yellow-500'], ['Projeto', 'project_note', 'text-blue-300'], ['Envio', 'shipping_method', 'text-gray-400'], ['Porto', 'shipping_terms', 'text-gray-400']].map(([lbl, k, cls]) => (
                                <div key={k} className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0">{lbl}</span>
                                    <input className={`flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono rounded outline-none h-5 text-[10px] ${cls}`} value={meta[k] || ''} onChange={e => updateMeta(k, e.target.value)} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="px-4 py-1 bg-[#161616] border-b border-[#2a2a2a] flex items-center gap-3">
                        <span className="text-[9px] text-gray-600 uppercase">Filtrar</span>
                        <input className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] px-2 text-[10px] text-gray-300 rounded outline-none" placeholder="SKU ou descrição..." value={itemFilter} onChange={e => setItemFilter(e.target.value)} />
                        <span className="text-[9px] text-gray-600">{filtered.length}/{lines.length}</span>
                    </div>
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
                                    <th className="p-2 w-28 text-right bg-[#252525]">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222]">
                                {filtered.map((line, idx) => (
                                    <tr key={idx} className="group hover:bg-[#1a1a1a]">
                                        <td className="p-2 text-center text-gray-600 border-r border-[#222]">{idx + 1}</td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-2 py-1.5 outline-none text-red-400 font-mono font-bold focus:bg-[#222]" value={line.sku || ''} onChange={e => updateLine(idx, 'sku', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-2 py-1.5 outline-none text-gray-300 focus:bg-[#222]" value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-1 py-1.5 outline-none text-center text-blue-300 font-bold focus:bg-[#222]" value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-2 py-1.5 outline-none text-right font-mono text-gray-400 focus:bg-[#222]" value={line.unitPrice ?? ''} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-1 py-1.5 outline-none text-center text-red-400 focus:bg-[#222]" value={line.discount1 ?? ''} onChange={e => updateLine(idx, 'discount1', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full bg-transparent px-1 py-1.5 outline-none text-center text-red-300 focus:bg-[#222]" value={line.discount2 ?? ''} onChange={e => updateLine(idx, 'discount2', e.target.value)} /></td>
                                        <td className="p-2 text-right font-mono font-bold text-gray-200 bg-[#151515]">{parseFloat(line.total || 0).toFixed(2)} €</td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && <tr><td colSpan="8" className="p-12 text-center text-gray-600 italic">Nenhum artigo.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className="h-14 bg-[#161616] border-t border-[#333] flex items-center justify-between px-6">
                        <input className="w-1/3 bg-transparent border-none outline-none text-[10px] text-gray-500 italic" placeholder="Notas..." value={safeData.notes || ''} onChange={e => onDataChange({ ...safeData, notes: e.target.value })} />
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase text-gray-600 font-bold">Total Proforma</span>
                                <span className="font-mono text-xl font-bold text-purple-400">{safeData.totals?.gross || '0.00'} €</span>
                            </div>
                            <div className="flex gap-2">
                                <button className="px-4 py-2 bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded hover:bg-blue-900/60" onClick={() => onSave(safeData)} disabled={saving}>💾 {saving ? 'A gravar...' : 'Guardar'}</button>
                                {mode === 'staging' && <button className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-2 rounded" onClick={() => onFinalize(safeData)}>✔ FINALIZAR</button>}
                                {mode === 'archive' && <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2 rounded" onClick={onClose}>✔ FECHAR</button>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
        </div>, document.body
    );
}
const scrollbarStyles = `.custom-scrollbar::-webkit-scrollbar{width:8px;height:8px}.custom-scrollbar::-webkit-scrollbar-track{background:#121212}.custom-scrollbar::-webkit-scrollbar-thumb{background:#333;border-radius:4px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#555}`;
