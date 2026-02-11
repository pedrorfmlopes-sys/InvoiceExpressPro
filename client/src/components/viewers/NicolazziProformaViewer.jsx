import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';
import { normalizeNicolazziData } from './nicolazziUtils';

// Helper: Local fallback (redirects to shared)
const normalizeData = (d) => normalizeNicolazziData(d);

export default function NicolazziProformaViewer({ doc, onClose, updateRow, onFinalize, onSwitch, mode = 'staging', t }) {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [showPdf, setShowPdf] = useState(true);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const onCancel = onClose; // Maintain internal consistency

    // UI State
    const [filter, setFilter] = useState('');

    // --- 1. Load Data (Parallel: PDF + Satellite + Fallback Main Doc) ---
    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            if (!doc || !doc.id) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                if (isMounted) setLoading(true);
                // Determine Source: Start with Prop
                let initialSource = doc.rawJson || doc.raw_data;

                // Fire requests in parallel
                const pPdf = api.get(`/api/corev2/docs/${doc.id}/view?project=${doc.project || 'default'}`, { responseType: 'blob' });
                const pSat = api.get(`/api/corev2/extraction-data/nicolazzi_proformas/${doc.id}`);

                // NEW: Fetch Fresh Main Doc Metadata as Backup (in case Prop is stale/truncated)
                const pMainDoc = api.get(`/api/corev2/docs/${doc.id}/json?project=${doc.project || 'default'}`);

                const [pdfRes, satRes, mainDocRes] = await Promise.allSettled([pPdf, pSat, pMainDoc]);

                if (!isMounted) return;

                // Handle PDF
                if (pdfRes.status === 'fulfilled') {
                    const url = URL.createObjectURL(pdfRes.value.data);
                    setPdfUrl(url);
                } else {
                    console.error("[Viewer] Failed to load PDF:", pdfRes.reason);
                    setPdfUrl(null);
                }

                // Handle Data Hierarchy
                // 1. Satellite (Highest Priority in Staging - Edited content)
                let finalData = null;

                if (mode === 'staging') {
                    if (satRes.status === 'fulfilled' && satRes.value.data && Object.keys(satRes.value.data).length > 0) {
                        finalData = satRes.value.data;
                        console.log("[Viewer] Loaded from Satellite");
                    }
                }

                // 2. Main Doc (Medium Priority - Initial Extraction or Archive State)
                if (!finalData && (mainDocRes.status === 'fulfilled' && mainDocRes.value.data)) {
                    const row = mainDocRes.value.data;
                    const raw = (row.rawJson && typeof row.rawJson === 'object') ? row.rawJson : (row.rawJson ? JSON.parse(row.rawJson) : {});
                    finalData = { ...row, ...raw };
                    console.log("[Viewer] Loaded from Main Doc (Parsed)");
                }

                // 3. Prop Fallback (Lowest Priority - List view data)
                if (!finalData && (doc.rawJson || doc.raw_data || doc.lines || doc.total)) {
                    const rawStr = doc.rawJson;
                    const raw = (rawStr && typeof rawStr === 'object') ? rawStr : (typeof rawStr === 'string' ? JSON.parse(rawStr) : {});
                    finalData = { ...doc, ...raw };
                    console.log("[Viewer] Loaded from Prop Fallback (Fixed)");
                }

                // EXTRA SAFETY (Phase 17): If lines are missing but exist in another key, migrate them
                if (finalData && !finalData.lines && finalData.items) finalData.lines = finalData.items;

                // Normalize and Set
                if (finalData) {
                    const norm = normalizeData(finalData);
                    setData(norm);
                } else {
                    console.warn("[Viewer] No data found from any source.");
                    setData(normalizeData({})); // Empty state
                }

            } catch (err) {
                console.error("Load Error", err);
                if (isMounted) setData(normalizeData({}));
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadData();

        // Cleanup Blob URL and isMounted flag
        return () => {
            isMounted = false;
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        };
    }, [doc, mode]);

    const handleDataChange = async (newData) => {
        setData(newData);
        try {
            setIsSaving(true);
            if (mode === 'staging') {
                await api.post(`/api/corev2/extraction-data/nicolazzi_proformas/${doc.id}`, newData);
            } else {
                // Archive Mode: Direct PATCH to Main DB
                await api.patch(`/api/corev2/docs/${doc.id}?project=${doc.project || 'default'}`, {
                    rawJson: newData,
                    docNumber: newData.docNumber,
                    date: newData.date,
                    total: newData.total,
                    supplier: newData.entities?.supplier,
                    customer: newData.entities?.customer
                });
            }

            // --- SYNC WITH BACKGROUND LIST ---
            if (updateRow) {
                if (newData.total !== doc.total) updateRow(doc.id, 'total', newData.total);
                if (newData.docNumber !== doc.docNumber) updateRow(doc.id, 'docNumber', newData.docNumber);
                if (newData.date !== doc.date) updateRow(doc.id, 'date', newData.date);
            }

        } catch (err) {
            console.error("Failed to save data", err);
        } finally {
            setIsSaving(false);
        }
    };

    const saveDraft = async () => {
        if (!data) return;
        await handleDataChange(data);
        alert("Rascunho guardado com sucesso!");
    };

    const handleLineChange = (idx, field, value) => {
        const newLines = [...(data?.lines || [])];
        const line = { ...newLines[idx], [field]: value };

        // Auto-Calc Line Total
        if (['quantity', 'unitPrice', 'discountPercent'].includes(field)) {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const discText = String(line.discountPercent || '0');
            // Handle Nicolazzi 50+5 style or simple float
            let disc = 0;
            if (discText.includes('+')) {
                const parts = discText.split('+').map(p => parseFloat(p) || 0);
                let multiplier = 1;
                parts.forEach(p => multiplier *= (1 - p / 100));
                disc = (1 - multiplier) * 100;
            } else {
                disc = parseFloat(discText) || 0;
            }
            line.total = (qty * price * (1 - disc / 100)).toFixed(2);
        }

        newLines[idx] = line;

        // Auto-Calc Global Totals
        const net = newLines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const transport = parseFloat(data?.totals?.transport || 0);
        const vat = parseFloat(data?.totals?.tax || data?.totals?.vat || 0);

        const totals = {
            ...(data?.totals || {}),
            goods: net.toFixed(2),
            net: net.toFixed(2),
            total: (net + transport + vat).toFixed(2),
            gross: (net + transport + vat).toFixed(2)
        };

        handleDataChange({ ...data, lines: newLines, totals, total: totals.gross });
    };

    const handleTotalChange = (field, value) => {
        const newTotals = { ...(data?.totals || {}), [field]: value };

        // If changing transport or tax, recalculate gross
        if (field === 'transport' || field === 'tax' || field === 'vat') {
            const net = parseFloat(newTotals.net || 0);
            const transport = parseFloat(newTotals.transport || 0);
            const vat = parseFloat(newTotals.tax || newTotals.vat || 0);
            newTotals.total = (net + transport + vat).toFixed(2);
            newTotals.gross = newTotals.total;
        }

        handleDataChange({ ...data, totals: newTotals, total: newTotals.gross });
    };

    const internalUpdateRow = (id, field, value) => {
        // Direct field update (docNumber, date, etc)
        handleDataChange({ ...data, [field]: value });
    };

    if (!doc) return null;

    const lines = data?.lines || [];
    const filteredLines = lines.filter(l =>
        (l.code || '').toLowerCase().includes(filter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(filter.toLowerCase())
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[5000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">
            <div className="flex flex-col h-full w-full relative overflow-hidden">

                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                PROFORMA VIEWER: {data?.docNumber || doc.docNumber || 'Novo'}
                                {isSaving && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded animate-pulse">A gravar...</span>}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter bg-blue-500/10 px-1.5 rounded">{data?.project || doc.project || 'Sem Projeto'}</span>
                                <span className="text-[10px] opacity-40">|</span>
                                <span className="text-xs opacity-50">Nicolazzi Proforma | Extrator V2</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onSwitch}
                            className="btn text-xs px-3 py-1 rounded-lg border border-yellow-500/30 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 transition-all flex items-center gap-2"
                        >
                            ✨ Mudar para Clássico
                        </button>
                    </div>
                    <button onClick={onCancel} className="btn text-xl p-0 w-8 h-8 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 rounded-full transition-all">✕</button>
                </div>

                {/* Split Screen Container */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-bold tracking-widest uppercase opacity-70">A carregar dados...</span>
                            </div>
                        </div>
                    )}

                    {/* PDF Section - Authenticated Blob */}
                    {showPdf && (
                        <div className="h-[30%] border-b border-[var(--border)] bg-gray-100 dark:bg-gray-800 relative transition-all duration-300">
                            {pdfUrl ? (
                                <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Source" />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs opacity-50">
                                    <div className="animate-pulse">A carregar PDF autenticado...</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Meta Header Bar (Single Line) */}
                    <div className="bg-[var(--surface)] p-2 px-4 flex gap-6 border-b border-[var(--border)] shadow-sm items-center flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] uppercase font-bold opacity-40">Nº Doc</label>
                            <input
                                className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 font-mono outline-none w-28"
                                value={data?.docNumber || ''}
                                onChange={(e) => internalUpdateRow(doc.id, 'docNumber', e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 border-l border-[var(--border)] pl-6">
                            <label className="text-[10px] uppercase font-bold opacity-40">Data</label>
                            <input
                                className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 font-mono outline-none w-24"
                                value={data?.date || ''} // Use data.date, not doc.date (prop is stale)
                                onChange={(e) => internalUpdateRow(doc.id, 'date', e.target.value)}
                            />
                        </div>
                        <div className="flex-1 flex items-center gap-3 border-l border-[var(--border)] pl-6">
                            <label className="text-[10px] uppercase font-bold opacity-40 whitespace-nowrap">Ref. Cliente (Your Ref)</label>
                            <input
                                className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 font-mono outline-none w-full"
                                value={data?.customerRef || ''}
                                onChange={(e) => {
                                    handleDataChange({ ...data, customerRef: e.target.value });
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-3 border-l border-[var(--border)] pl-6">
                            <label className="text-[10px] uppercase font-bold opacity-40">Total Bruto</label>
                            <div className="flex items-center gap-1 font-mono font-bold text-lg text-blue-400">
                                <span>€</span>
                                <input
                                    className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 w-24 text-right outline-none"
                                    value={data?.total || ''}
                                    onChange={(e) => internalUpdateRow(doc.id, 'total', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bottom Section: Scrollable Items */}
                    <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg-base)] custom-scrollbar min-h-0">
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--accent-primary)]">Itens da Proposta</h4>
                                <input
                                    className="bg-[var(--card)] border border-[var(--border)] rounded px-4 py-1.5 text-xs w-64 outline-none focus:ring-1 ring-blue-500 transition-all"
                                    placeholder="Pesquisar SKU ou Descrição..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                />
                            </div>
                            <div className="rounded-lg border border-[var(--border)] overflow-hidden shadow-sm bg-[var(--card)]">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-[var(--surface)] font-bold opacity-75 border-b border-[var(--border)] sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 border-r border-[var(--border)] w-32 text-center">Referência</th>
                                            <th className="p-2 border-r border-[var(--border)]">Descrição</th>
                                            <th className="p-2 border-r border-[var(--border)] text-center w-16">Qtd</th>
                                            <th className="p-2 border-r border-[var(--border)] text-right w-24">Pr. Unit</th>
                                            <th className="p-2 border-r border-[var(--border)] text-center w-16">Desc %</th>
                                            <th className="p-2 text-right w-28">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {filteredLines.length > 0 ? filteredLines.map((line, idx) => (
                                            <tr key={idx} className="hover:bg-[var(--surface-hover)] group">
                                                <td className="p-1 border-r border-[var(--border)]">
                                                    <input
                                                        className="bg-transparent w-full px-2 py-1 outline-none font-mono group-hover:bg-blue-500/5 focus:bg-blue-500/10 text-center"
                                                        value={line.code || ''}
                                                        onChange={(e) => handleLineChange(idx, 'code', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 border-r border-[var(--border)]">
                                                    <input
                                                        className="bg-transparent w-full px-2 py-1 outline-none group-hover:bg-blue-500/5 focus:bg-blue-500/10"
                                                        value={line.description || ''}
                                                        onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 border-r border-[var(--border)]">
                                                    <input
                                                        className="bg-transparent w-full px-1 py-1 outline-none text-center group-hover:bg-blue-500/5 focus:bg-blue-500/10"
                                                        value={line.quantity || ''}
                                                        onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 border-r border-[var(--border)]">
                                                    <input
                                                        className="bg-transparent w-full px-1 py-1 outline-none text-right font-mono group-hover:bg-blue-500/5 focus:bg-blue-500/10"
                                                        value={line.unitPrice || ''}
                                                        onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 border-r border-[var(--border)]">
                                                    <input
                                                        className="bg-transparent w-full px-1 py-1 outline-none text-center group-hover:bg-blue-500/5 focus:bg-blue-500/10"
                                                        value={line.discountPercent || ''}
                                                        onChange={(e) => handleLineChange(idx, 'discountPercent', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 text-right">
                                                    <input
                                                        className="bg-transparent w-full px-2 py-1 outline-none text-right font-bold group-hover:bg-blue-500/5 focus:bg-blue-500/10"
                                                        value={line.total || ''}
                                                        onChange={(e) => handleLineChange(idx, 'total', e.target.value)}
                                                    />
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan="6" className="p-8 text-center opacity-50 italic">Nenhum item encontrado no documento.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary Totals Section */}
                            {!loading && data?.totals && (
                                <div className="mt-4 flex justify-end">
                                    <div className="w-full max-w-xs space-y-2 border border-[var(--border)] rounded-lg p-4 bg-[var(--surface)] text-[11px]">
                                        <div className="flex justify-between items-center opacity-70 uppercase font-bold tracking-tighter">
                                            <span>Subtotal</span>
                                            <div className="flex items-center gap-1">
                                                <span>€</span>
                                                <input
                                                    className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 w-20 text-right outline-none font-mono"
                                                    value={data.totals.goods || data.totals.subtotal || ''}
                                                    onChange={(e) => handleTotalChange('goods', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center opacity-70 uppercase font-bold tracking-tighter">
                                            <span>Portes / Shipping</span>
                                            <div className="flex items-center gap-1">
                                                <span>€</span>
                                                <input
                                                    className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 w-20 text-right outline-none font-mono"
                                                    value={data.totals.transport || ''}
                                                    onChange={(e) => handleTotalChange('transport', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center opacity-70 uppercase font-bold tracking-tighter">
                                            <span>IVA / Tax</span>
                                            <div className="flex items-center gap-1">
                                                <span>€</span>
                                                <input
                                                    className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 w-20 text-right outline-none font-mono"
                                                    value={data.totals.tax || data.totals.vat || ''}
                                                    onChange={(e) => handleTotalChange('tax', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-[var(--border)] flex justify-between items-center font-bold text-blue-400 text-sm uppercase">
                                            <span>Total Final</span>
                                            <div className="flex items-center gap-1">
                                                <span>€</span>
                                                <input
                                                    className="bg-transparent border-b border-blue-500/30 focus:border-blue-500 px-1 py-0.5 w-24 text-right outline-none font-mono"
                                                    value={data.totals.total || data.totals.gross || ''}
                                                    onChange={(e) => {
                                                        handleTotalChange('total', e.target.value);
                                                        internalUpdateRow(doc.id, 'total', e.target.value);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Extra Metadata Recap */}
                        {!loading && data && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                                <div className="p-3 border border-[var(--border)] rounded-lg bg-[var(--card)] text-[10px]">
                                    <span className="font-bold uppercase opacity-50 block mb-1">📦 Entrega</span>
                                    {data?.entities?.shipTo?.address || data?.entities?.customer?.address || 'N/A'}
                                </div>
                                <div className="p-3 border border-[var(--border)] rounded-lg bg-[var(--card)] text-[10px] flex justify-between items-center font-mono">
                                    <span className="font-bold uppercase opacity-50 block">Modo de Extração</span>
                                    {mode === 'staging' ? 'Staging (Satellite)' : 'Archive (Direct)'}
                                </div>
                            </div>
                        )}

                        {!loading && !data && (
                            <div className="flex flex-col items-center justify-center p-12 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-center">
                                <span className="text-3xl mb-4">⚠️</span>
                                <h5 className="font-bold text-yellow-600 dark:text-yellow-500">Dados não carregados</h5>
                                <p className="text-xs opacity-60 mt-2">Não foi possível recuperar os dados da extração.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)] flex justify-between items-center">
                    <div className="text-[10px] opacity-40 italic flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                        O modo de edição direta grava alterações instantaneamente.
                    </div>
                    <div className="flex gap-2">
                        <button className="btn text-xs px-4" onClick={onCancel}>Fechar</button>
                        <button
                            className="btn text-xs px-4 bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                            onClick={saveDraft}
                            disabled={isSaving}
                        >
                            {isSaving ? 'A gravar...' : '💾 Guardar Rascunho'}
                        </button>
                        {mode === 'staging' && (
                            <button className="btn primary px-8 text-xs font-bold" onClick={() => {
                                if (onFinalize && data) onFinalize(data);
                                else onCancel();
                            }}>Finalizar Validação</button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
