import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

// BUTÖ FATURA VIEWER — Tema Yellow/Gold | Nicolazzi-style layout
export default function ButoFaturaViewer({
    doc, data, loading, saving, pdfUrl,
    onDataChange, onSave, onClose, onFinalize, mode
}) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [itemFilter, setItemFilter] = useState('');
    const [focusedSku, setFocusedSku] = useState(null);

    const handleReProcess = async () => {
        if (!confirm('Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original.')) return;
        try {
            setReprocessing(true);
            const res = await api.post(`/api/reprocess/${doc.id}?project=${doc.project || 'default'}`);
            onDataChange(res.data.rawJson || {});
            alert('Releitura efetuada com sucesso!');
        } catch (err) {
            alert('Erro ao reprocessar: ' + (err.response?.data?.error || err.message));
        } finally { setReprocessing(false); }
    };

    const handleSkuFocus = (idx, val) => setFocusedSku({ idx, val });
    const handleSkuBlur = async (idx, finalVal) => {
        if (!focusedSku || focusedSku.idx !== idx) return;
        const original = focusedSku.val;
        if (original && finalVal && original !== finalVal) {
            if (window.confirm(`Memorizar correção de código BUTO?\n${original} → ${finalVal}`)) {
                try { await api.post('/api/catalog/aliases', { brand: 'BUTO', originalSku: original, correctedSku: finalVal }); }
                catch (err) { console.error(err); }
            }
        }
        setFocusedSku(null);
    };

    const upd = (field, val) => onDataChange({ ...data, [field]: val });
    const updDate = (field, val) => onDataChange({ ...data, dates: { ...(data.dates || {}), [field]: val } });
    const updEntity = (et, field, val) => {
        const entities = { ...(data.entities || {}) };
        entities[et] = { ...(entities[et] || {}), [field]: val };
        onDataChange({ ...data, entities });
    };
    const updTotals = (field, val) => {
        const newData = { ...data, totals: { ...(data.totals || {}), [field]: val } };
        onDataChange(recalculateTotal(newData));
    };
    const recalculateTotal = (newData) => {
        const sub = parseFloat(newData.totals?.subtotal || 0);
        const disc = parseFloat(newData.totals?.additionalDiscount || 0);
        const trans = parseFloat(newData.totals?.transport || 0);
        const newTotal = (sub - disc + trans).toFixed(2);
        return { ...newData, totals: { ...newData.totals, total: newTotal } };
    };

    const updateLine = (idx, field, val) => {
        const lines = [...(data.lines || [])];
        const line = { ...lines[idx], [field]: val };
        if (['quantity', 'basePrice', 'incrementPercent', 'discountPercent'].includes(field)) {
            const qty = parseFloat(line.quantity) || 0;
            const bPrice = parseFloat(line.basePrice) || 0;
            const inc = parseFloat(line.incrementPercent) || 0;
            const disc = parseFloat(String(line.discountPercent || '0').replace(',', '.')) || 0;
            const priceWithInc = bPrice * (1 + inc / 100);
            line.totalBeforeDto = parseFloat((qty * priceWithInc).toFixed(2));
            line.total = parseFloat((line.totalBeforeDto * (1 - disc / 100)).toFixed(2));
        }
        lines[idx] = line;
        const subtotal = lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const newData = { ...data, lines, totals: { ...data.totals, subtotal: subtotal.toFixed(2) } };
        onDataChange(recalculateTotal(newData));
    };

    if (!doc) return null;
    const sd = data || { lines: [], totals: {}, entities: {}, dates: {} };
    const cust = sd.entities?.customer || {};
    const supp = sd.entities?.supplier || {};
    const filteredLines = (sd.lines || []).filter(l =>
        (l.code || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );
    const hasAdditionalDiscount = parseFloat(sd.totals?.additionalDiscount || 0) > 0;

    const inp = (val, onChange, cls = '') => (
        <input
            className={`w-full bg-transparent border-none outline-none text-[11px] leading-tight ${cls}`}
            value={val || ''}
            onChange={e => onChange(e.target.value)}
        />
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/95 flex flex-col font-sans text-xs w-screen h-screen overflow-hidden">

            {/* TOOLBAR */}
            <div className="h-10 bg-[#0f0e00] border-b border-yellow-900/40 flex items-center justify-between px-4 shrink-0 shadow-lg">
                <div className="flex items-center gap-3">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-yellow-500 font-black italic uppercase">Butö Fatura</span>
                        <span className="opacity-30">|</span>
                        <span className="font-mono text-yellow-400">{sd.docNumber || 'NOVO DOC'}</span>
                    </h2>
                    {(loading || reprocessing) && <span className="text-yellow-400 animate-pulse font-bold text-[10px]">A PROCESSAR...</span>}
                </div>
                <div className="flex gap-2">
                    <button onClick={handleReProcess} disabled={reprocessing || loading}
                        className="px-3 py-1 bg-yellow-900/30 hover:bg-yellow-700/40 border border-yellow-700/40 text-yellow-300 rounded text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
                        🔄 Releitura
                    </button>
                    <button onClick={() => setShowPdf(v => !v)}
                        className="px-3 py-1 bg-[#0f0e00] border border-yellow-900/30 text-zinc-500 hover:text-yellow-300 rounded text-[10px] font-black uppercase tracking-widest transition-all">
                        {showPdf ? '⊟ PDF' : '⊞ PDF'}
                    </button>
                    <button onClick={onClose}
                        className="px-3 py-1 bg-[#0f0e00] border border-yellow-900/30 text-zinc-600 hover:text-red-400 rounded text-[10px] font-black uppercase tracking-widest transition-all">
                        ✕ Fechar
                    </button>
                </div>
            </div>

            {/* BODY */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* PDF TOP */}
                {showPdf && pdfUrl && (
                    <div className="h-[30vh] shrink-0 bg-[#0a0900] border-b-4 border-yellow-900/20 relative z-10 shadow-lg">
                        <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Fatura" />
                    </div>
                )}

                {/* DATA PANEL */}
                <div className={`flex flex-col overflow-hidden bg-[#080700] ${showPdf && pdfUrl ? 'h-[calc(70vh-40px)]' : 'flex-1'}`}>

                    {/* ═══ ENTITY HEADER BAR ═══ */}
                    <div className="grid grid-cols-4 gap-0 border-b border-yellow-900/20 bg-[#0d0c00] shrink-0" style={{ minHeight: '90px' }}>

                        {/* FORNECEDOR */}
                        <div className="border-r border-yellow-900/20 p-3 relative">
                            <label className="absolute -top-[7px] left-3 bg-[#0d0c00] px-1 text-[9px] text-zinc-600 font-black uppercase tracking-[0.15em]">Fornecedor / Supplier</label>
                            {inp(supp.name, v => updEntity('supplier', 'name', v), 'font-bold text-zinc-400 text-[11px] mb-1')}
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-zinc-700 resize-none leading-tight"
                                style={{ height: '44px' }}
                                value={supp.address || ''}
                                onChange={e => updEntity('supplier', 'address', e.target.value)}
                            />
                        </div>

                        {/* CLIENTE / BILL TO */}
                        <div className="border-r border-yellow-900/20 p-3 relative group hover:bg-yellow-900/5 transition-colors">
                            <label className="absolute -top-[7px] left-3 bg-[#0d0c00] px-1 text-[9px] text-yellow-700 font-black uppercase tracking-[0.15em]">Cliente / Bill To</label>
                            {inp(cust.name, v => updEntity('customer', 'name', v), 'font-bold text-yellow-300 text-[11px] mb-0.5')}
                            <div className="flex gap-2 mb-0.5">
                                <span className="text-zinc-700 text-[9px] shrink-0 mt-0.5">NIF:</span>
                                {inp(cust.vat, v => updEntity('customer', 'vat', v), 'font-mono text-zinc-500 text-[10px]')}
                            </div>
                            <div className="flex gap-2 mb-0.5">
                                <span className="text-zinc-700 text-[9px] shrink-0 mt-0.5">Tel:</span>
                                {inp(cust.phone, v => updEntity('customer', 'phone', v), 'font-mono text-zinc-600 text-[10px]')}
                            </div>
                            <div className="flex gap-2">
                                <span className="text-zinc-700 text-[9px] shrink-0 mt-0.5">Mail:</span>
                                {inp(cust.email, v => updEntity('customer', 'email', v), 'text-zinc-600 text-[10px]')}
                            </div>
                        </div>

                        {/* ENTREGA / SHIP TO — mirrors customer */}
                        <div className="border-r border-yellow-900/20 p-3 relative group hover:bg-yellow-900/5 transition-colors">
                            <label className="absolute -top-[7px] left-3 bg-[#0d0c00] px-1 text-[9px] text-emerald-700 font-black uppercase tracking-[0.15em]">Entrega / Ship To</label>
                            {inp(cust.name, v => updEntity('customer', 'name', v), 'font-bold text-emerald-600 text-[11px] mb-0.5')}
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-zinc-600 resize-none leading-tight"
                                style={{ height: '58px' }}
                                value={cust.address || ''}
                                onChange={e => updEntity('customer', 'address', e.target.value)}
                                placeholder="Morada de entrega (igual ao cliente)..."
                            />
                        </div>

                        {/* PROYECTO & META — Fatura has linked order + payment */}
                        <div className="p-3 relative">
                            <label className="absolute -top-[7px] left-3 bg-[#0d0c00] px-1 text-[9px] text-zinc-600 font-black uppercase tracking-[0.15em]">Proyecto &amp; Meta</label>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                <span className="text-[9px] text-zinc-700 font-black uppercase tracking-wider self-center">Fatura Nº</span>
                                <input className="bg-[#080700] border border-yellow-900/30 rounded px-2 h-5 text-right font-mono text-yellow-500 font-black text-[10px] outline-none focus:border-yellow-500"
                                    value={sd.docNumber || ''} onChange={e => upd('docNumber', e.target.value)} />

                                <span className="text-[9px] text-zinc-700 font-black uppercase tracking-wider self-center">Fecha</span>
                                <input className="bg-[#080700] border border-yellow-900/20 rounded px-2 h-5 text-right font-mono text-zinc-400 text-[10px] outline-none focus:border-yellow-500"
                                    value={sd.dates?.issued || ''} onChange={e => updDate('issued', e.target.value)} />

                                <span className="text-[9px] text-cyan-900 font-black uppercase tracking-wider self-center">Nº Pedido</span>
                                <input className="bg-[#080700] border border-cyan-900/20 rounded px-2 h-5 text-right font-mono text-cyan-700 text-[10px] outline-none focus:border-cyan-600"
                                    value={sd.docRefs?.linkedOrder || ''} onChange={e => onDataChange({ ...sd, docRefs: { ...(sd.docRefs || {}), linkedOrder: e.target.value } })} />

                                <span className="text-[9px] text-zinc-700 font-black uppercase tracking-wider self-center">Fecha salida</span>
                                <input className="bg-[#080700] border border-zinc-900/20 rounded px-2 h-5 text-right font-mono text-zinc-500 text-[10px] outline-none focus:border-yellow-500"
                                    value={sd.dates?.deliveryEstimate || ''} onChange={e => updDate('deliveryEstimate', e.target.value)} />
                            </div>
                            {/* Ref. Cliente */}
                            <div className="mt-2 pt-1 border-t border-yellow-900/10">
                                <span className="text-[9px] text-amber-800 font-black uppercase tracking-wider block mb-0.5">Ref. Cliente</span>
                                <textarea
                                    className="w-full bg-[#080700] border border-orange-900/20 rounded px-2 py-0.5 text-orange-400 font-bold text-[10px] outline-none resize-none focus:border-orange-600 uppercase leading-tight"
                                    style={{ height: '30px' }}
                                    value={sd.shippingMarks || ''}
                                    onChange={e => upd('shippingMarks', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* FILTER */}
                    <div className="flex gap-2 px-3 py-1.5 bg-[#060600] border-b border-yellow-900/10 shrink-0">
                        <input placeholder="🔍 Filtrar por código ou descrição..."
                            className="flex-1 bg-[#080700] border border-yellow-900/20 px-2 h-6 text-zinc-400 text-[10px] rounded outline-none focus:border-yellow-700"
                            value={itemFilter} onChange={e => setItemFilter(e.target.value)} />
                        <span className="text-zinc-800 text-[9px] self-center">{filteredLines.length} linha{filteredLines.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* TABLE */}
                    <div className="flex-1 overflow-auto bg-[#080700] custom-scrollbar">
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead className="bg-[#0d0c00] text-[9px] uppercase text-yellow-900 font-black sticky top-0 z-10 border-b border-yellow-900/20 tracking-widest">
                                <tr>
                                    <th className="p-2 w-8 text-center border-r border-yellow-900/10">#</th>
                                    <th className="p-2 w-12 text-center border-r border-yellow-900/10">UD.</th>
                                    <th className="p-2 w-28 border-r border-yellow-900/10 text-yellow-500">COD.</th>
                                    <th className="p-2 border-r border-yellow-900/10">DESCRIPCIÓN</th>
                                    <th className="p-2 w-20 text-center border-r border-yellow-900/10 text-cyan-900">DETALLE</th>
                                    <th className="p-2 w-16 text-center border-r border-yellow-900/10 text-cyan-800">ACABADO</th>
                                    <th className="p-2 w-22 text-right border-r border-yellow-900/10">PRECIO (€)</th>
                                    <th className="p-2 w-12 text-center border-r border-yellow-900/10 text-amber-800">%INC.</th>
                                    <th className="p-2 w-22 text-right border-r border-yellow-900/10 text-zinc-700">TOTAL s/Dto</th>
                                    <th className="p-2 w-14 text-center border-r border-yellow-900/10 text-red-900">DTO.%</th>
                                    <th className="p-2 w-24 text-right text-yellow-500">SUBTOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-yellow-900/10">
                                {filteredLines.map((line, idx) => (
                                    <tr key={idx} className="group hover:bg-yellow-900/[0.06] transition-colors">
                                        <td className="p-2 text-center text-zinc-800 font-mono text-[9px]">{idx + 1}</td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent px-1 outline-none text-center text-blue-400 font-black focus:bg-white/5"
                                                value={line.quantity ?? 1} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent px-2 outline-none text-yellow-500 font-mono font-black focus:bg-yellow-500/10 uppercase"
                                                value={line.code || ''} onChange={e => updateLine(idx, 'code', e.target.value)}
                                                onFocus={() => handleSkuFocus(idx, line.code)} onBlur={e => handleSkuBlur(idx, e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent px-2 outline-none text-zinc-300 focus:text-white truncate"
                                                value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent text-center outline-none text-cyan-700 font-mono text-[10px] uppercase"
                                                value={line.detailCode || ''} onChange={e => updateLine(idx, 'detailCode', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent text-center outline-none text-cyan-600 font-mono font-black text-[10px] uppercase"
                                                value={line.finishCode || ''} onChange={e => updateLine(idx, 'finishCode', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent px-2 outline-none text-right font-mono text-zinc-400"
                                                value={line.basePrice ?? ''} onChange={e => updateLine(idx, 'basePrice', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent text-center outline-none text-amber-700 font-mono"
                                                value={line.incrementPercent ?? 0} onChange={e => updateLine(idx, 'incrementPercent', e.target.value)} />
                                        </td>
                                        <td className="p-2 text-right font-mono text-zinc-700 tabular-nums">{line.totalBeforeDto?.toFixed?.(2) ?? '—'}</td>
                                        <td className="p-0 border-r border-yellow-900/10">
                                            <input className="w-full h-7 bg-transparent text-center outline-none text-red-800 font-mono"
                                                value={line.discountPercent ?? 0} onChange={e => updateLine(idx, 'discountPercent', e.target.value)} />
                                        </td>
                                        <td className="p-2 text-right font-mono font-black text-yellow-400 tabular-nums">{(line.total ?? 0).toFixed?.(2)} €</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ═══ FOOTER BAR — Exact Nicolazzi Style ═══ */}
                    <div className="bg-[#0b0b05] border-t border-yellow-900/30 flex items-center justify-between px-6 py-2 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                        {/* Left: totals breakdown */}
                        <div className="flex items-center gap-8">
                            {/* Subtotal */}
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-600 tracking-widest">Subtotal</span>
                                <span className="font-mono text-zinc-300 font-bold text-base tabular-nums">
                                    {parseFloat(sd.totals?.subtotal || 0).toFixed(2)} <span className="text-zinc-600 ml-0.5 text-xs">€</span>
                                </span>
                            </div>

                            {/* Portes — Input box style */}
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-600 tracking-widest">Portes</span>
                                <div className="flex items-center bg-[#1a1a0a] border border-yellow-900/40 rounded px-2 h-7 focus-within:border-yellow-500 transition-all">
                                    <input
                                        className="w-16 bg-transparent border-none outline-none font-mono text-zinc-400 text-sm text-right tabular-nums"
                                        value={sd.totals?.transport ?? ''}
                                        onChange={e => updTotals('transport', e.target.value)}
                                        placeholder="0.00"
                                    />
                                    <span className="text-zinc-600 text-[10px] ml-1.5 font-bold">€</span>
                                </div>
                            </div>

                            {/* Total Final — Prominent Yellow */}
                            <div className="flex flex-col items-start gap-0.5 ml-4">
                                <span className="text-[9px] uppercase font-black text-yellow-500 tracking-widest">Total Fatura</span>
                                <span className="font-mono text-2xl font-black text-yellow-400 tabular-nums drop-shadow-[0_0_15px_rgba(253,224,71,0.4)]">
                                    {parseFloat(sd.totals?.total || 0).toFixed(2)} <span className="text-yellow-600/60 ml-1 text-sm">€</span>
                                </span>
                            </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex gap-3">
                            <button onClick={() => onSave(sd)} disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 bg-zinc-900/80 text-zinc-400 border border-zinc-700/30 rounded-lg hover:text-white hover:border-zinc-500 transition-all font-black uppercase text-[10px] tracking-[0.1em] active:scale-95 shadow-lg">
                                <span>💾</span> {saving ? 'A Guardar...' : 'Guardar'}
                            </button>
                            {mode === 'staging' && (
                                <button onClick={() => onFinalize(sd)}
                                    className="flex items-center gap-2 px-8 py-2 bg-yellow-600 hover:bg-yellow-500 text-zinc-900 rounded-lg shadow-[0_0_20px_rgba(253,224,71,0.4)] transition-all active:scale-95 font-black uppercase text-[11px] tracking-[0.15em] border border-yellow-400/30">
                                    <span>✔</span> Finalizar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar{width:4px;height:4px}.custom-scrollbar::-webkit-scrollbar-track{background:#080700}.custom-scrollbar::-webkit-scrollbar-thumb{background:#2a2200;border-radius:4px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#ca8a04}` }} />
        </div>,
        document.body
    );
}
