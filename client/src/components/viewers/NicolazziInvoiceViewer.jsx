import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';

/**
 * NicolazziInvoiceViewer (Digital Twin Edition)
 * Layout: Vertical Split (Twin-Frame)
 * Persistence: Sandbox-First (Satellite DB: nicolazzi_invoices)
 */
export default function NicolazziInvoiceViewer({ doc, onClose, updateRow, onFinalize }) {
    // --- State ---
    const [satelliteData, setSatelliteData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reprocessing, setReprocessing] = useState(false);
    const [showPdf, setShowPdf] = useState(true);
    const [pdfUrl, setPdfUrl] = useState(null);

    // Filter for Item Grid
    const [itemFilter, setItemFilter] = useState('');

    // --- Effects ---
    useEffect(() => {
        if (!doc?.id) return;
        loadData();
        return () => {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        };
    }, [doc?.id]);

    // --- Actions ---
    async function loadData() {
        if (!doc || !doc.id) return;

        try {
            setLoading(true);

            // 1. Fire Parallel Requests
            // Endpoint changed to nicolazzi_invoices
            const pSat = api.get(`/api/corev2/extraction-data/nicolazzi_invoices/${doc.id}`);
            const pPdf = api.get(`/api/corev2/docs/${doc.id}/view?project=${doc.project || 'default'}`, { responseType: 'blob' });
            const pMainDoc = api.get(`/api/corev2/docs/${doc.id}/json?project=${doc.project || 'default'}`);

            const [satRes, pdfRes, mainDocRes] = await Promise.allSettled([pSat, pPdf, pMainDoc]);

            // 2. Handle PDF
            if (pdfRes.status === 'fulfilled') {
                const url = URL.createObjectURL(pdfRes.value.data);
                setPdfUrl(url);
            } else {
                console.warn("[InvoiceViewer] PDF Load Failed", pdfRes.reason);
            }

            // 3. Handle Data Hierarchy and Merging
            // Hierarchy: Satellite (Edit) > MainDoc.rawJson (Initial Extract) > Prop (Fallback)

            let finalData = null;

            // A. Check Satellite
            if (satRes.status === 'fulfilled' && satRes.value.data &&
                ((satRes.value.data.lines && satRes.value.data.lines.length > 0) ||
                    (satRes.value.data.totals && satRes.value.data.totals.total))
            ) {
                finalData = satRes.value.data;
                console.log("[InvoiceViewer] Loaded from Satellite");
            }

            // B. Check Main Doc Fresh Fetch (Repair Mechanism)
            else if (mainDocRes.status === 'fulfilled' && mainDocRes.value.data && mainDocRes.value.data.rawJson) {
                const raw = typeof mainDocRes.value.data.rawJson === 'string'
                    ? JSON.parse(mainDocRes.value.data.rawJson)
                    : mainDocRes.value.data.rawJson;

                if (raw && Object.keys(raw).length > 0) {
                    finalData = raw;
                    console.log("[InvoiceViewer] Loaded from Main Doc (Fresh Fetch)");
                }
            }

            // C. Fallback to Prop
            if (!finalData) {
                let propData = doc.rawJson || (doc.raw_data ? (typeof doc.raw_data === 'string' ? JSON.parse(doc.raw_data) : doc.raw_data) : null);

                // Safety: Parse if string
                if (typeof propData === 'string') {
                    try { propData = JSON.parse(propData); } catch (e) { propData = null; }
                }

                if (propData) {
                    finalData = propData;
                    console.log("[InvoiceViewer] Loaded from Prop Fallback");
                }
            }

            setSatelliteData(normalizeData(finalData || {}));

        } catch (err) {
            console.error("[InvoiceViewer] Critical Load Error:", err);
            setSatelliteData(normalizeData({}));
        } finally {
            setLoading(false);
        }
    }

    // Helper: Normalize Backend JSON (Poppler/Engine) to Viewer State
    function normalizeData(incoming) {
        if (!incoming) return {};
        const d = { ...incoming };

        // 1. Normalize Totals (Engine uses goods/total, Viewer uses net/gross)
        d.totals = d.totals || {};
        if (d.totals.goods !== undefined && d.totals.net === undefined) d.totals.net = d.totals.goods;
        if (d.totals.total !== undefined && d.totals.gross === undefined) d.totals.gross = d.totals.total;

        // 2. Normalize Lines
        if (Array.isArray(d.lines)) {
            d.lines = d.lines.map(l => ({
                ...l,
                // Engine uses discountText (e.g. "45"), Viewer uses discountPercent
                discountPercent: l.discountPercent !== undefined ? l.discountPercent : (parseFloat(l.discountText) || 0),
                // Ensure numeric types for UI calcs
                unitPrice: parseFloat(l.unitPrice) || 0,
                quantity: parseFloat(l.quantity) || 0,
                total: parseFloat(l.total) || 0
            }));
        }

        // 3. Normalize Extracted Date if present in 'dates.issued' to root 'date'
        if (d.dates?.issued && !d.date) d.date = d.dates.issued;

        // 4. Normalize Project Ref (Customer Ref)
        // FORCE: Always map ProjectRef if found (Aggressive Fix)
        if (d.projectRef) {
            d.docRefs = [d.projectRef];
        } else if (d.docRefs && !Array.isArray(d.docRefs) && typeof d.docRefs === 'object') {
            // Legacy Object Support (Proforma)
            const refs = [];
            if (d.docRefs.customerRef) refs.push(d.docRefs.customerRef);
            d.docRefs = refs;
        }

        return d;
    }

    const handleReProcess = async () => {
        if (!confirm("Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original com o motor Poppler.")) return;

        try {
            setReprocessing(true);
            // Call the real reprocess endpoint
            const res = await api.post(`/api/reprocess/${doc.id}?project=${doc.project}`);
            const freshDoc = res.data;

            const freshData = freshDoc.rawJson || {};
            setSatelliteData(normalizeData(freshData));

            alert("Releitura efetuada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao reprocessar: " + (err.response?.data?.error || err.message));
        } finally {
            setReprocessing(false);
        }
    };

    const saveData = async (newData) => {
        setSatelliteData(newData);
        try {
            setSaving(true);
            // Endpoint changed to nicolazzi_invoices
            await api.post(`/api/corev2/extraction-data/nicolazzi_invoices/${doc.id}`, newData);
            if (newData.totals?.gross !== doc.total) updateRow(doc.id, 'total', newData.totals?.gross);
            if (newData.docNumber !== doc.docNumber) updateRow(doc.id, 'docNumber', newData.docNumber);
        } catch (err) {
            console.error("Save failed:", err);
        } finally {
            setSaving(false);
        }
    };

    // --- Helpers ---
    const updateHeader = (field, val) => saveData({ ...satelliteData, [field]: val });

    const updateEntity = (entityType, field, val) => {
        const entities = { ...(satelliteData.entities || {}) };
        entities[entityType] = { ...(entities[entityType] || {}), [field]: val };
        saveData({ ...satelliteData, entities });
    };

    const updateLine = (idx, field, val) => {
        const lines = [...(satelliteData.lines || [])];
        const line = { ...lines[idx], [field]: val };

        // Auto-Calc Line Total
        if (field === 'quantity' || field === 'unitPrice' || field === 'discountPercent') {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const disc = parseFloat(line.discountPercent) || 0;
            line.total = parseFloat((qty * price * (1 - disc / 100)) || 0).toFixed(2);
        }

        lines[idx] = line;

        // Auto-Calc Global Totals
        const net = lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const transport = parseFloat(satelliteData.totals?.transport || 0);
        const vat = parseFloat(satelliteData.totals?.vat || 0);

        const totals = {
            ...satelliteData.totals,
            net: parseFloat(net || 0).toFixed(2),
            gross: parseFloat((net + transport + vat) || 0).toFixed(2)
        };

        // If simple 'tax' field exists (legacy support), update it too if needed, but 'vat' is standard here
        // Note: Invoices have 'tax' in extractor.
        if (satelliteData.totals?.tax !== undefined) totals.tax = vat;

        saveData({ ...satelliteData, lines, totals });
    };

    // --- Render ---
    if (!doc) return null;
    const data = satelliteData || {};
    const lines = data.lines || [];
    const filteredLines = lines.filter(l =>
        (l.code || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[5000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">

            {/* 1. TOP TOOLBAR */}
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-yellow-500">NICOLAZZI INVOICE VIEWER</span>
                        <span className="opacity-30">|</span>
                        {doc.docNumber || 'SEM NÚMERO'}
                    </h2>
                    {saving && <span className="text-[10px] text-blue-400 animate-pulse">A GRAVAR...</span>}
                </div>
                <div className="flex gap-2">
                    <button onClick={handleReProcess} disabled={reprocessing} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors flex items-center gap-2">
                        <span>{reprocessing ? '⚙️' : '🔄'}</span> Refazer Releitura
                    </button>
                    <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1 rounded border border-gray-600 transition-colors ${showPdf ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-gray-800 text-gray-400'}`}>
                        {showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
                    </button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded transition-colors">
                        ✕ Fechar
                    </button>
                </div>
            </div>

            {/* 2. MAIN SPLIT CONTAINER */}
            <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">

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

                    {/* B1. QUADRANTS HEADER */}
                    <div className="p-4 grid grid-cols-4 gap-4 border-b border-[#333] bg-[#1a1a1a]">

                        {/* Q1: SUPPLIER */}
                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-[#555] transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">Fornecedor / Supplier</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-gray-200" value={data.entities?.supplier?.name || 'NICOLAZZI S.p.A.'} disabled />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 h-12 resize-none mt-1"
                                value={data.entities?.supplier?.address || ''}
                                onChange={e => updateEntity('supplier', 'address', e.target.value)}
                            />
                        </div>

                        {/* Q2: CUSTOMER (BILL TO) */}
                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-blue-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-500 font-bold uppercase tracking-wider">Cliente / Bill To</label>
                            <input
                                className="w-full bg-transparent border-none outline-none font-bold text-blue-100 placeholder-white/10"
                                value={data.entities?.customer?.name || ''}
                                onChange={e => updateEntity('customer', 'name', e.target.value)}
                                placeholder="Nome do Cliente"
                            />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-12 resize-none mt-1 custom-scrollbar"
                                value={data.entities?.customer?.address || ''}
                                onChange={e => updateEntity('customer', 'address', e.target.value)}
                                placeholder="Morada Fiscal..."
                            />
                        </div>

                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-green-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-green-600 font-bold uppercase tracking-wider">Entrega / Ship To</label>
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-16 resize-none mt-1 leading-snug custom-scrollbar"
                                value={data.entities?.shipping?.address || ''}
                                onChange={e => updateEntity('shipping', 'address', e.target.value)}
                                placeholder="Morada de Entrega..."
                            />
                        </div>

                        {/* Q4: PROJECT & META */}
                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-yellow-900/50 transition-colors flex flex-col gap-1.5">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase tracking-wider">Projeto & Meta</label>

                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-500 uppercase w-14 shrink-0">Doc Nº</span>
                                <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-yellow-500 font-bold rounded focus:border-yellow-500 outline-none h-5"
                                    value={data.docNumber || ''} onChange={e => updateHeader('docNumber', e.target.value)} />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-500 uppercase w-14 shrink-0">Data</span>
                                <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right font-mono text-gray-300 rounded focus:border-yellow-500 outline-none h-5"
                                    value={data.date || ''} onChange={e => updateHeader('date', e.target.value)} />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-500 uppercase w-14 shrink-0">Ref. Proj</span>
                                <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right text-[10px] text-gray-300 rounded focus:border-yellow-500 outline-none h-5 font-bold"
                                    value={(data.docRefs || [])[0] || ''} onChange={e => saveData({ ...data, docRefs: [e.target.value] })} />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-500 uppercase w-14 shrink-0 leading-tight">Ship Marks</span>
                                <input className="flex-1 bg-[#0f0f0f] border border-[#333] px-2 text-right text-[10px] text-yellow-500/80 rounded focus:border-yellow-500 outline-none h-5"
                                    value={data.shippingMarks || ''} onChange={e => updateHeader('shippingMarks', e.target.value)} />
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
                                    <th className="p-2 w-[10%] text-right text-yellow-600 border-r border-[#333]">REF. ENC.</th>
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
                                                value={line.code || ''} onChange={e => updateLine(idx, 'code', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-gray-300 focus:bg-[#222]"
                                                value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                                        </td>
                                        <td className="p-0 border-r border-[#222]">
                                            <input className="w-full h-full bg-transparent px-2 py-2 outline-none text-right text-yellow-600 font-bold focus:bg-[#222]"
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
                                value={data.notes || ''}
                                onChange={e => updateHeader('notes', e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-gray-600">Subtotal</span>
                                <span className="font-mono text-gray-400">{data.totals?.net || '0.00'} €</span>
                            </div>
                            <div className="flex flex-col items-end group">
                                <span className="text-[9px] uppercase font-bold text-gray-600 group-hover:text-blue-500 cursor-pointer">Portes (Edit)</span>
                                <input
                                    className="bg-transparent border-b border-[#333] w-16 text-right font-mono text-gray-300 outline-none focus:border-blue-500"
                                    value={data.totals?.transport || '0.00'}
                                    onChange={e => {
                                        const val = e.target.value;
                                        // Update Transport and Global Total instantly
                                        const newTotals = { ...data.totals, transport: val };
                                        const net = parseFloat(newTotals.net || 0);
                                        const vat = parseFloat(newTotals.vat || 0);
                                        const trans = parseFloat(val || 0) || 0;
                                        newTotals.gross = parseFloat((net + vat + trans) || 0).toFixed(2);
                                        setSatelliteData({ ...satelliteData, totals: newTotals });
                                    }}
                                />
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-gray-600">Total Final</span>
                                <span className="font-mono text-xl font-bold text-yellow-500">{data.totals?.gross || '0.00'} €</span>
                            </div>
                            <button className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-2 rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                onClick={onFinalize}
                            >
                                <span>✔</span> FINALIZAR
                            </button>
                        </div>
                    </div>
                </div>
            </div>
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
