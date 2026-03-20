import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient'; // Still needed for Reprocess logic? Or move to Container?
import { normalizeInvoiceData } from './nicolazziInvoiceUtils'; // For reprocess normalization
import NicolazziReconciliationViewer from './NicolazziReconciliationViewer';

/**
 * RitmonioViewer (Pure Presenter)
 * Receives data from Container. Only handles UI interaction.
 */
export default function RitmonioViewer({
    doc,
    data,
    loading,
    saving,
    pdfUrl,

    onDataChange,
    onSave,
    onClose,
    onFinalize,

    mode // 'staging' or 'archive'
}) {
    // Local UI State
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [reconciling, setReconciling] = useState(false); // [NEW] Reconciliation state
    const [showReconViewer, setShowReconViewer] = useState(false); // [NEW] Detail Viewer
    const [itemFilter, setItemFilter] = useState('');
    const [focusedSku, setFocusedSku] = useState(null);

    const handleSkuFocus = (idx, val) => {
        setFocusedSku({ idx, val });
    };

    const handleSkuBlur = async (idx, finalVal) => {
        if (!focusedSku || focusedSku.idx !== idx) return;
        const original = focusedSku.val;
        if (original && finalVal && original !== finalVal) {
            if (window.confirm(`Pretende que o sistema lembre esta correção de código?\n\nOriginal: ${original}\nNovo: ${finalVal}`)) {
                try {
                    await api.post('/api/catalog/aliases', {
                        brand: 'RITMONIO',
                        originalSku: original,
                        correctedSku: finalVal
                    });
                    alert('Correção memorizada com sucesso!');
                } catch (err) {
                    console.error('Erro ao memorizar código:', err);
                    alert('Erro ao gravar a correção no sistema.');
                }
            }
        }
        setFocusedSku(null);
    };

    // --- Actions (Delegated to Container via onDataChange) ---

    const updateHeader = (field, val) => {
        const newData = { ...data, [field]: val };
        onDataChange(newData);
    };

    const updateEntity = (entityType, field, val) => {
        const entities = { ...(data.entities || {}) };
        entities[entityType] = { ...(entities[entityType] || {}), [field]: val };
        onDataChange({ ...data, entities });
    };

    const calculateCompound = (discountStr) => {
        if (!discountStr) return 0;
        const parts = String(discountStr).replace(/,/g, '.').split('+');
        let multiplier = 1;
        parts.forEach(p => {
            const v = parseFloat(p) || 0;
            multiplier *= (1 - (v / 100));
        });
        return (1 - multiplier) * 100;
    };

    const updateLine = (idx, field, val) => {
        const lines = [...(data.lines || [])];
        const line = { ...lines[idx], [field]: val };

        // Auto-Calc Line Total
        if (field === 'quantity' || field === 'unitPrice' || field === 'discountPercent') {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const disc = calculateCompound(line.discountPercent);
            line.total = parseFloat((qty * price * (1 - disc / 100)) || 0).toFixed(2);
        }

        lines[idx] = line;

        // Auto-Calc Global Totals
        const net = lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const transport = parseFloat(data.totals?.transport || 0);
        const vat = parseFloat(data.totals?.vat || 0);

        const totals = {
            ...data.totals,
            net: parseFloat(net || 0).toFixed(2),
            gross: parseFloat((net + transport + vat) || 0).toFixed(2)
        };

        // Sync 'total' alias
        totals.total = totals.gross;

        onDataChange({ ...data, lines, totals });
    };

    // Reprocess Logic (Still local for now, could be moved to Container)
    const handleReProcess = async () => {
        if (!confirm("Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original.")) return;
        try {
            setReprocessing(true);
            // Assuming endpoint exists
            const res = await api.post(`/api/reprocess/${doc.id}?project=${doc.project || 'default'}`);
            const freshDoc = res.data;
            const freshData = freshDoc.rawJson || {};

            // Normalize immediately
            const cleanData = normalizeInvoiceData(freshData);
            onDataChange(cleanData); // Push up to Container

            alert("Releitura efetuada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao reprocessar: " + (err.response?.data?.error || err.message));
        } finally {
            setReprocessing(false);
        }
    };

    // Reconcile Logic
    const handleReconcile = async () => {
        if (!data.shippingMarks) {
            alert("Erro: Não existe 'Shipping Marks' nesta fatura para ligar à Proposta.");
            return;
        }
        if (!confirm(`Tentar reconciliar com a Proposta nº "${data.shippingMarks}"?`)) return;

        try {
            setReconciling(true);
            const res = await api.post(`/api/nicolazzi/reconcile/${doc.id}`);
            const result = res.data;

            if (result.success) {
                alert(`Sucesso! Ligado à Proposta: ${result.proposal}.\nLinhas Abatidas: ${result.matched_lines}/${result.total_lines}`);
            } else {
                alert(`Aviso: ${result.reason}`);
            }
        } catch (err) {
            console.error(err);
            alert("Erro ao reconciliar: " + (err.response?.data?.error || err.message));
        } finally {
            setReconciling(false);
        }
    };

    // --- Render ---
    if (!doc) return null;

    // Safety Fallback for initial render
    const safeData = data || { lines: [], totals: {}, entities: {} };
    const lines = safeData.lines || [];
    const filteredLines = lines.filter(l =>
        (l.code || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">

            {/* 1. TOP TOOLBAR */}
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-yellow-500">RITMONIO VIEWER</span>
                        <span className="opacity-30">|</span>
                        {safeData.docNumber || 'SEM NÚMERO'}
                    </h2>
                    {saving && <span className="text-[10px] text-blue-400 animate-pulse">A GRAVAR...</span>}
                </div>
                <div className="flex gap-2">
                    {mode === 'staging' && (
                        <button onClick={handleReProcess} disabled={reprocessing} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors flex items-center gap-2">
                            <span>{reprocessing ? '⚙️' : '🔄'}</span> Refazer Releitura
                        </button>
                    )}
                    <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1 rounded border border-gray-600 transition-colors ${showPdf ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-gray-800 text-gray-400'}`}>
                        {showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
                    </button>
                    <button onClick={() => setShowReconViewer(true)} className="px-3 py-1 bg-indigo-900/40 text-indigo-400 border border-indigo-800/50 rounded hover:bg-indigo-900/60 transition-colors flex items-center gap-2">
                        📋 Ver Reconciliação
                    </button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded transition-colors">
                        ✕ Fechar
                    </button>
                </div>
            </div>

            {/* 2. MAIN SPLIT CONTAINER */}
            <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">

                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 z-[6000] bg-black/50 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-white animate-pulse font-bold">A CARREGAR DADOS...</div>
                    </div>
                )}

                {/* FRAME A: PDF */}
                {showPdf && (
                    <div className="h-[30vh] shrink-0 bg-[#0f0f0f] border-b-4 border-[#111] relative shadow-lg z-10 transition-all duration-300">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Source"></iframe>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 animate-pulse">A carregar PDF de Alta Fidelidade...</div>
                        )}
                    </div>
                )}

                {/* FRAME B: DATA COCKPIT */}
                <div className="h-[calc(70vh-40px)] w-full bg-[#121212] text-gray-300 flex flex-col overflow-hidden min-h-0">

                    {/* B1. QUADRANTS HEADER (5 Columns) */}
                    <div className="p-4 grid grid-cols-5 gap-3 border-b border-[#333] bg-[#1a1a1a]">

                        {/* Q1: SUPPLIER */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-[#555] transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">Fornecedor / Supplier</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-gray-200" value={safeData.entities?.supplier?.name || 'RITMONIO Srl'} disabled />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 h-16 resize-none mt-1"
                                value={safeData.entities?.supplier?.address || ''}
                                onChange={e => updateEntity('supplier', 'address', e.target.value)}
                            />
                        </div>

                        {/* Q2: CUSTOMER (BILL TO) */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-blue-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-500 font-bold uppercase tracking-wider">Cliente / Bill To</label>
                            <input
                                className="w-full bg-transparent border-none outline-none font-bold text-blue-100 placeholder-white/10"
                                value={safeData.entities?.customer?.name || ''}
                                onChange={e => updateEntity('customer', 'name', e.target.value)}
                                placeholder="Nome do Cliente"
                            />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-16 resize-none mt-1 custom-scrollbar"
                                value={safeData.entities?.customer?.address || ''}
                                onChange={e => updateEntity('customer', 'address', e.target.value)}
                                placeholder="Morada Fiscal..."
                            />
                        </div>

                        {/* Q3: DELIVERY ADDRESS */}
                        <div className="col-span-1 border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-green-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-green-500 font-bold uppercase tracking-wider">Endereço de Envio</label>
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-[84px] resize-none mt-1 custom-scrollbar leading-relaxed"
                                value={safeData.entities?.customer?.deliveryAddress || ''}
                                onChange={e => updateEntity('customer', 'deliveryAddress', e.target.value)}
                                placeholder="Morada de Entrega (DAP/EXW)..."
                            />
                        </div>

                        {/* Q4: PROJECT & META */}
                        <div className="col-span-2 border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-yellow-900/50 transition-colors flex gap-2">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase tracking-wider">Projeto & Meta</label>

                            {/* Left Column */}
                            <div className="flex-1 flex flex-col justify-center gap-3 border-r border-[#222] pr-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 uppercase w-12 shrink-0">Doc Nº</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-yellow-500 font-bold rounded focus:border-yellow-500 outline-none h-8"
                                        value={safeData.docNumber || ''} onChange={e => updateHeader('docNumber', e.target.value)} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 uppercase w-12 shrink-0">Data</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-gray-300 rounded focus:border-yellow-500 outline-none h-8"
                                        value={safeData.date || ''} onChange={e => updateHeader('date', e.target.value)} />
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="flex-1 flex flex-col justify-center gap-3 pl-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0">Ref. Proj</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right text-[10px] text-gray-300 rounded focus:border-yellow-500 outline-none h-8 font-bold"
                                        value={safeData.projectRef || ''}
                                        onChange={e => updateHeader('projectRef', e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 uppercase w-16 shrink-0 leading-tight">Ship Marks</span>
                                    <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right text-[10px] text-yellow-500/80 rounded focus:border-yellow-500 outline-none h-8"
                                        value={safeData.shippingMarks || ''}
                                        onChange={e => updateHeader('shippingMarks', e.target.value)}
                                        placeholder="Marcas (Ex: CSO1212)..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* B2. SMART GRID */}
                    <div className="flex-1 overflow-auto bg-[#121212] custom-scrollbar p-0 relative">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#1f1f1f] text-[10px] uppercase text-gray-500 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-2 w-10 text-center border-r border-[#333]">#</th>
                                    <th className="p-2 w-32 border-r border-[#333]">SKU</th>
                                    <th className="p-2 border-r border-[#333]">Descrição (Click to Expand)</th>
                                    <th className="p-2 w-[10%] text-center text-yellow-600 border-r border-[#333]">REF. ENC.</th>
                                    <th className="p-2 w-16 text-center border-r border-[#333]">Qtd</th>
                                    <th className="p-2 w-24 text-right border-r border-[#333]">Unit Price</th>
                                    <th className="p-2 w-16 text-center border-r border-[#333]">Desc%</th>
                                    <th className="p-2 w-28 text-right bg-[#252525] text-gray-300">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222]">
                                {filteredLines.map((line, idx) => (
                                    <tr key={idx} className="group hover:bg-[#1a1a1a] transition-colors">
                                        <td className="p-2 text-center text-gray-600 border-r border-[#222]">{idx + 1}</td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-yellow-500 font-mono font-bold focus:bg-[#222]"
                                                value={line.code || ''}
                                                onChange={e => updateLine(idx, 'code', e.target.value)}
                                                onFocus={e => handleSkuFocus(idx, e.target.value)}
                                                onBlur={e => handleSkuBlur(idx, e.target.value)}
                                            />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-gray-300 focus:bg-[#222]"
                                                value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-center text-yellow-600 font-bold focus:bg-[#222]"
                                                value={line.projectRef || ''}
                                                placeholder="-"
                                                onChange={e => updateLine(idx, 'projectRef', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-2 outline-none text-center text-blue-300 font-bold focus:bg-[#222]"
                                                value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-right font-mono text-gray-400 focus:bg-[#222]"
                                                value={line.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-1 py-2 outline-none text-center text-red-400 focus:bg-[#222]"
                                                value={line.discountPercent || ''} onChange={e => updateLine(idx, 'discountPercent', e.target.value)} />
                                        </td>
                                        <td className="p-2 text-right font-mono font-bold text-gray-200 bg-[#151515] group-hover:bg-[#1a1a1a]">
                                            {line.total} €
                                        </td>
                                    </tr>
                                ))}
                                {filteredLines.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="p-12 text-center text-gray-600 italic">
                                            Nenhum artigo encontrado. Use a extração Poppler ou adicione manualmente.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* B3. FINANCIAL FOOTER */}
                    <div className="h-16 bg-[#161616] border-t border-[#333] flex items-center justify-between px-6 shadow-2xl z-20">
                        <div className="w-1/2">
                            <input
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 italic placeholder-gray-700"
                                placeholder="Notas internas ou observações..."
                                value={safeData.notes || ''}
                                onChange={e => updateHeader('notes', e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-gray-600">Subtotal</span>
                                <span className="font-mono text-gray-400">{safeData.totals?.net || '0.00'} €</span>
                            </div>
                            <div className="flex flex-col items-end group">
                                <span className="text-[9px] uppercase font-bold text-gray-600 group-hover:text-blue-500 cursor-pointer">Portes (Edit)</span>
                                <input
                                    className="bg-transparent border-b border-[#333] w-16 text-right font-mono text-gray-300 outline-none focus:border-blue-500"
                                    value={safeData.totals?.transport || '0.00'}
                                    onChange={e => {
                                        const val = e.target.value;
                                        // Dynamic update immediately
                                        const newTotals = { ...safeData.totals, transport: val };
                                        const net = parseFloat(newTotals.net || 0);
                                        const vat = parseFloat(newTotals.vat || 0);
                                        const trans = parseFloat(val || 0) || 0;
                                        newTotals.gross = parseFloat((net + vat + trans) || 0).toFixed(2);
                                        newTotals.total = newTotals.gross;

                                        onDataChange({ ...safeData, totals: newTotals });
                                    }}
                                />
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-gray-600">Total Final</span>
                                <span className="font-mono text-xl font-bold text-yellow-500">{safeData.totals?.gross || '0.00'} €</span>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="px-4 py-2 bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded hover:bg-blue-900/60 transition-colors flex items-center gap-2"
                                    onClick={() => onSave(safeData)}
                                    disabled={saving}
                                >
                                    💾 {saving ? 'A gravar...' : 'Guardar'}
                                </button>

                                {mode === 'staging' && (
                                    <>
                                        <button
                                            className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                            onClick={handleReconcile}
                                            disabled={reconciling}
                                        >
                                            <span>{reconciling ? '⏳' : '🔗'}</span> {reconciling ? 'A Ligar...' : 'Ligar Proposta'}
                                        </button>
                                        <button
                                            className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-2 rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                            onClick={() => onFinalize(safeData)}
                                        >
                                            <span>✔</span> FINALIZAR
                                        </button>
                                    </>
                                )}

                                {mode === 'archive' && (
                                    <button
                                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2 rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                        onClick={onClose}
                                    >
                                        <span>✔</span> FECHAR
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: styles }} />

            {showReconViewer && (
                <NicolazziReconciliationViewer
                    invoiceId={doc.id}
                    onClose={() => setShowReconViewer(false)}
                />
            )}
        </div>,
        document.body
    );
}

const styles = `
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #121212; 
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #333; 
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #555; 
}
`;
