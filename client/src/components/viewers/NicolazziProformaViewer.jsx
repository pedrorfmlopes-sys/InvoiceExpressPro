import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';
import { FiSearch, FiCloud, FiX } from 'react-icons/fi';
import { normalizeNicolazziData } from './nicolazziUtils';

// Helper: Local fallback (redirects to shared)
const normalizeData = (d) => normalizeNicolazziData(d);

export default function NicolazziProformaViewer({
    doc, onClose, updateRow, onFinalize, onSwitch, mode = 'staging', t,
    data, setData, pdfUrl, loading, isSaving, onSave
}) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const onCancel = onClose; // Maintain internal consistency

    // UI State
    const [filter, setFilter] = useState('');

    // CRM Search State
    const [isSearchingCRM, setIsSearchingCRM] = useState(false);
    const [crmResults, setCrmResults] = useState(null);
    const [isSyncingCRM, setIsSyncingCRM] = useState(false);

    const handleReProcess = async () => {
        if (!confirm("Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original.")) return;

        try {
            setReprocessing(true);
            const res = await api.post(`/api/corev2/docs/${doc.id}/reprocess?project=${doc.project || 'default'}`);
            const freshDoc = res.data;
            const freshData = freshDoc.rawJson || {};
            setData(normalizeNicolazziData(freshData));
            alert("Releitura efetuada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao reprocessar: " + (err.response?.data?.error || err.message));
        } finally {
            setReprocessing(false);
        }
    };

    const updateEntity = (entity, field, value) => {
        const newEntities = { ...data.entities, [entity]: { ...data.entities[entity], [field]: value } };
        setData({ ...data, entities: newEntities });
    };

    // --- CRM Handlers ---
    const handleCRMSearch = async () => {
        const q = data.entities?.customer?.name || data.entities?.customer?.vat || '';
        if (!q) return alert("Introduza um nome ou NIF para pesquisar.");

        try {
            setIsSearchingCRM(true);
            const res = await api.get(`/api/crm/search?q=${q}&project=${doc.project || 'default'}`);
            setCrmResults(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSearchingCRM(false);
        }
    };

    const handleCRMSync = async () => {
        const customer = data.entities?.customer;
        if (!customer?.name || !customer?.vat) return alert("Nome e NIF são obrigatórios para sincronizar com o CRM.");

        try {
            setIsSyncingCRM(true);
            await api.post(`/api/crm/upsert?project=${doc.project || 'default'}`, customer);
            alert("Cliente sincronizado com sucesso no CRM!");
        } catch (err) {
            console.error(err);
            alert("Erro ao sincronizar: " + (err.response?.data?.error || err.message));
        } finally {
            setIsSyncingCRM(false);
        }
    };

    const applyCRMCustomer = (crm) => {
        const entities = { ...(data.entities || {}) };
        entities.customer = {
            ...entities.customer,
            name: crm.name,
            vat: crm.vat,
            address: crm.address,
            email: crm.email,
            phone: crm.phone
        };
        setData({ ...data, entities });
        setCrmResults(null);
    };

    const saveDraft = async () => {
        if (!data) return;
        const ok = await onSave(data);
        if (ok) alert("Rascunho guardado com sucesso!");
    };

    const handleLineChange = (idx, field, value) => {
        const newLines = [...(data?.lines || [])];
        const line = { ...newLines[idx], [field]: value };

        if (['quantity', 'unitPrice', 'discountPercent'].includes(field)) {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const discText = String(line.discountPercent || '0');
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

        const net = newLines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const transport = parseFloat(data?.totals?.transport || 0) || 0;
        const vat = parseFloat(data?.totals?.tax || data?.totals?.vat || 0) || 0;

        const totals = {
            ...(data?.totals || {}),
            goods: net.toFixed(2),
            net: net.toFixed(2),
            total: (net + transport + vat).toFixed(2),
            gross: (net + transport + vat).toFixed(2)
        };

        setData({ ...data, lines: newLines, totals, total: totals.gross });
    };

    const handleTotalChange = (field, value) => {
        const newTotals = { ...(data?.totals || {}), [field]: value };
        if (field === 'transport' || field === 'tax' || field === 'vat') {
            const net = parseFloat(newTotals.net || newTotals.goods || newTotals.subtotal || 0) || 0;
            const transport = parseFloat(newTotals.transport || 0) || 0;
            const vat = parseFloat(newTotals.tax || newTotals.vat || 0) || 0;
            newTotals.total = (net + transport + vat).toFixed(2);
            newTotals.gross = newTotals.total;
        }
        setData({ ...data, totals: newTotals, total: newTotals.gross });
    };

    const internalUpdateRow = (id, field, value) => {
        setData({ ...data, [field]: value });
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
                                <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter bg-blue-500/10 px-1.5 rounded">{data?.projectLabel || doc.project || 'Sem Projeto'}</span>
                                <span className="text-[10px] opacity-40">|</span>
                                <span className="text-xs opacity-50">Nicolazzi Proforma | Extrator V2</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleReProcess}
                            disabled={reprocessing}
                            className="btn text-xs px-3 py-1 rounded-lg border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all flex items-center gap-2"
                        >
                            <span>{reprocessing ? '⚙️' : '🔄'}</span> Refazer Releitura
                        </button>
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

                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-bold tracking-widest uppercase opacity-70">A carregar dados...</span>
                            </div>
                        </div>
                    )}

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

                    {/* Meta Bar */}
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
                                value={data?.date || ''}
                                onChange={(e) => internalUpdateRow(doc.id, 'date', e.target.value)}
                            />
                        </div>
                        <div className="flex-1 flex items-center gap-3 border-l border-[var(--border)] pl-6">
                            <label className="text-[10px] uppercase font-bold opacity-40 whitespace-nowrap">Ref. Cliente</label>
                            <input
                                className="bg-transparent border-b border-[var(--border)] focus:border-blue-500 px-1 py-0.5 font-mono outline-none w-full"
                                value={data?.customerRef || ''}
                                onChange={(e) => setData({ ...data, customerRef: e.target.value })}
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

                    {/* Entities Section */}
                    <div className="bg-[var(--surface)] p-3 px-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-[var(--border)]">
                        <div className="border border-[var(--border)] rounded p-2 bg-[var(--card)]/50 relative group hover:border-blue-500/30 transition-all">
                            <label className="absolute -top-2 left-2 bg-[var(--surface)] px-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">Fornecedor / Supplier</label>
                            <input
                                className="w-full bg-transparent border-none outline-none font-bold text-[var(--text-main)] text-sm mb-1"
                                value={data?.entities?.supplier?.name || ''}
                                onChange={(e) => updateEntity('supplier', 'name', e.target.value)}
                            />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-[var(--text-muted)] h-10 resize-none leading-tight"
                                value={data?.entities?.supplier?.address || ''}
                                onChange={(e) => updateEntity('supplier', 'address', e.target.value)}
                            />
                        </div>

                        <div className="border border-[var(--border)] rounded p-2 bg-[var(--card)]/50 relative group hover:border-blue-500/50 transition-all">
                            <label className="absolute -top-2 left-2 bg-[var(--surface)] px-1 text-[9px] text-blue-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                Cliente / Bill To
                                <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCRMSearch(); }}
                                        title="Pesquisar no CRM"
                                        className="hover:text-blue-400 text-blue-500/60 transition-colors"
                                    >
                                        <FiSearch size={10} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCRMSync(); }}
                                        title="Sincronizar com CRM"
                                        className="hover:text-green-400 text-green-500/60 transition-colors"
                                    >
                                        <FiCloud size={10} />
                                    </button>
                                </div>
                            </label>

                            <div className="relative">
                                <input
                                    className="w-full bg-transparent border-none outline-none font-bold text-blue-400 text-sm mb-1 placeholder-white/5"
                                    value={data?.entities?.customer?.name || ''}
                                    onChange={(e) => updateEntity('customer', 'name', e.target.value)}
                                    placeholder="Nome do Cliente"
                                />

                                {crmResults && (
                                    <div className="absolute top-full left-0 w-full bg-[var(--surface)] border border-blue-500/30 rounded-lg shadow-2xl z-[6000] mt-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                                        <div className="p-2 border-b border-[var(--border)] flex justify-between items-center bg-blue-500/5">
                                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Resultados CRM</span>
                                            <button onClick={() => setCrmResults(null)} className="text-gray-500 hover:text-white transition-colors">
                                                <FiX size={12} />
                                            </button>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                            {crmResults.length === 0 ? (
                                                <div className="p-4 text-center text-gray-500 italic text-[10px]">Nenhum cliente encontrado.</div>
                                            ) : (
                                                crmResults.map(crm => (
                                                    <div
                                                        key={crm.id}
                                                        onClick={() => applyCRMCustomer(crm)}
                                                        className="p-2 hover:bg-blue-500/10 cursor-pointer border-b border-[var(--border)] last:border-none transition-colors"
                                                    >
                                                        <div className="font-bold text-blue-100 flex justify-between gap-2 overflow-hidden">
                                                            <span className="truncate">{crm.name}</span>
                                                            <span className="text-[9px] text-gray-500 shrink-0 font-mono">{crm.vat}</span>
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 truncate mt-0.5 opacity-60">{crm.address}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-[var(--text-muted)] h-10 resize-none leading-tight"
                                value={data?.entities?.customer?.address || ''}
                                onChange={(e) => updateEntity('customer', 'address', e.target.value)}
                                placeholder="Morada Fiscal..."
                            />
                        </div>

                        <div className="border border-[var(--border)] rounded p-2 bg-[var(--card)]/50 relative group hover:border-green-500/50 transition-all">
                            <label className="absolute -top-2 left-2 bg-[var(--surface)] px-1 text-[9px] text-green-500 font-bold uppercase tracking-wider">Entrega / Ship To</label>
                            <input
                                className="w-full bg-transparent border-none outline-none font-bold text-green-400 text-sm mb-1"
                                value={data?.entities?.shipTo?.name || ''}
                                onChange={(e) => updateEntity('shipTo', 'name', e.target.value)}
                                placeholder="Nome do Destinatário"
                            />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-[var(--text-muted)] h-16 resize-none leading-tight"
                                value={data?.entities?.shipTo?.address || data?.entities?.customer?.address || ''}
                                onChange={(e) => updateEntity('shipTo', 'address', e.target.value)}
                                placeholder="Morada de Entrega..."
                            />
                        </div>
                    </div>

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
                    </div>
                </div>

                <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)] flex justify-between items-center">
                    <div className="text-[10px] opacity-40 italic flex items-center gap-2">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                        As alterações são guardadas ao clicar em Guardar Rascunho.
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
