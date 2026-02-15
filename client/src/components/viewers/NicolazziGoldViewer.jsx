import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/apiClient';
import { FiSearch, FiCloud, FiCheck, FiX as FiXIcon } from 'react-icons/fi';
import { normalizeNicolazziData } from './nicolazziUtils';

export default function NicolazziGoldViewer({
    doc, onClose, updateRow, onFinalize, onSwitch, mode = 'staging',
    satelliteData, setSatelliteData, pdfUrl, loading, saving, onSave
}) {
    const [showPdf, setShowPdf] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [itemFilter, setItemFilter] = useState('');

    // CRM Search State
    const [isSearchingCRM, setIsSearchingCRM] = useState(false);
    const [crmResults, setCrmResults] = useState(null);
    const [isSyncingCRM, setIsSyncingCRM] = useState(false);

    const handleReProcess = async () => {
        if (!confirm("Tem a certeza? Isto irá apagar todas as edições manuais e reler o PDF original com o motor Poppler.")) return;

        try {
            setReprocessing(true);
            const res = await api.post(`/api/corev2/docs/${doc.id}/reprocess?project=${doc.project || 'default'}`);
            const freshDoc = res.data;
            const freshData = freshDoc.rawJson || {};
            setSatelliteData(normalizeNicolazziData(freshData));
            alert("Releitura efetuada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao reprocessar: " + (err.response?.data?.error || err.message));
        } finally {
            setReprocessing(false);
        }
    };

    const updateHeader = (field, val) => setSatelliteData({ ...satelliteData, [field]: val });

    const updateEntity = (entityType, field, val) => {
        const entities = { ...(satelliteData.entities || {}) };
        entities[entityType] = { ...(entities[entityType] || {}), [field]: val };
        setSatelliteData({ ...satelliteData, entities });
    };

    // --- CRM Handlers ---
    const handleCRMSearch = async () => {
        const q = satelliteData.entities?.customer?.name || satelliteData.entities?.customer?.vat || '';
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
        const customer = satelliteData.entities?.customer;
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
        const entities = { ...(satelliteData.entities || {}) };
        entities.customer = {
            ...entities.customer,
            name: crm.name,
            vat: crm.vat,
            address: crm.address,
            email: crm.email,
            phone: crm.phone
        };
        setSatelliteData({ ...satelliteData, entities });
        setCrmResults(null);
    };

    const updateLine = (idx, field, val) => {
        const lines = [...(satelliteData.lines || [])];
        const line = { ...lines[idx], [field]: val };

        if (field === 'quantity' || field === 'unitPrice' || field === 'discountPercent') {
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

        lines[idx] = line;

        const net = lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
        const transport = parseFloat(satelliteData.totals?.transport || 0) || 0;
        const vat = parseFloat(satelliteData.totals?.tax || satelliteData.totals?.vat || 0) || 0;

        const totals = {
            ...satelliteData.totals,
            net: net.toFixed(2),
            goods: net.toFixed(2),
            gross: (net + transport + vat).toFixed(2),
            total: (net + transport + vat).toFixed(2)
        };

        setSatelliteData({ ...satelliteData, lines, totals });
    };

    if (!doc) return null;
    const data = satelliteData || {};
    const lines = data.lines || [];
    const filteredLines = lines.filter(l =>
        (l.code || '').toLowerCase().includes(itemFilter.toLowerCase()) ||
        (l.description || '').toLowerCase().includes(itemFilter.toLowerCase())
    );

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[5000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-yellow-500">NICOLAZZI PROFORMA VIEWER</span>
                        <span className="opacity-30">|</span>
                        {doc.docNumber || 'SEM NÚMERO'}
                    </h2>
                    {saving && <span className="text-[10px] text-blue-400 animate-pulse">A GRAVAR...</span>}
                </div>
                <div className="flex gap-2">
                    {mode !== 'archive' && (
                        <button onClick={handleReProcess} disabled={reprocessing} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors flex items-center gap-2">
                            <span>{reprocessing ? '⚙️' : '🔄'}</span> Refazer Releitura
                        </button>
                    )}
                    <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1 rounded border border-gray-600 transition-colors ${showPdf ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-gray-800 text-gray-400'}`}>
                        {showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
                    </button>
                    <button onClick={onSwitch} className="px-3 py-1 bg-yellow-900/40 hover:bg-yellow-900/60 text-yellow-400 border border-yellow-800/50 rounded transition-colors flex items-center gap-2">
                        ✨ Mudar para Moderno
                    </button>
                    <button onClick={onClose} className="px-3 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 rounded transition-colors">✕ Fechar</button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
                {showPdf && (
                    <div className="h-[30vh] shrink-0 bg-[#0f0f0f] border-b-4 border-[#111] relative shadow-lg z-10 transition-all duration-300">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Source"></iframe>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 animate-pulse">A carregar PDF de Alta Fidelidade...</div>
                        )}
                    </div>
                )}

                <div className="h-[calc(70vh-40px)] w-full bg-[#121212] text-gray-300 flex flex-col overflow-hidden min-h-0">
                    <div className="p-4 grid grid-cols-4 gap-4 border-b border-[#333] bg-[#1a1a1a]">
                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-[#555] transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider">Fornecedor / Supplier</label>
                            <input className="w-full bg-transparent border-none outline-none font-bold text-gray-200" value={data.entities?.supplier?.name || 'NICOLAZZI S.p.A.'} onChange={e => updateEntity('supplier', 'name', e.target.value)} />
                            <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 h-12 resize-none mt-1" value={data.entities?.supplier?.address || ''} onChange={e => updateEntity('supplier', 'address', e.target.value)} />
                        </div>
                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-blue-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-blue-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                Cliente / Bill To
                                <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleCRMSearch(); }} title="Pesquisar no CRM" className="hover:text-white text-blue-400">
                                        <FiSearch size={10} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleCRMSync(); }} title="Atualizar/Sincronizar CRM" className="hover:text-white text-green-400">
                                        <FiCloud size={10} />
                                    </button>
                                </div>
                            </label>

                            <div className="relative">
                                <input className="w-full bg-transparent border-none outline-none font-bold text-blue-100 placeholder-white/10" value={data.entities?.customer?.name || ''} onChange={e => updateEntity('customer', 'name', e.target.value)} placeholder="Nome do Cliente" />

                                {crmResults && (
                                    <div className="absolute top-full left-0 w-full bg-[#1e1e1e] border border-blue-900/50 rounded shadow-2xl z-[6000] mt-1 overflow-hidden scale-in-center">
                                        <div className="p-2 border-b border-[#333] flex justify-between items-center bg-[#252525]">
                                            <span className="text-[10px] font-bold text-blue-400">Resultados CRM</span>
                                            <button onClick={() => setCrmResults(null)} className="text-gray-500 hover:text-white"><FiXIcon size={12} /></button>
                                        </div>
                                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                            {crmResults.length === 0 ? (
                                                <div className="p-4 text-center text-gray-500 italic">Nenhum cliente encontrado.</div>
                                            ) : (
                                                crmResults.map(crm => (
                                                    <div
                                                        key={crm.id}
                                                        onClick={() => applyCRMCustomer(crm)}
                                                        className="p-2 hover:bg-blue-900/20 cursor-pointer border-b border-[#222] last:border-none transition-colors group/item"
                                                    >
                                                        <div className="font-bold text-blue-100 flex justify-between">
                                                            <span>{crm.name}</span>
                                                            <span className="text-[9px] text-gray-500">{crm.vat}</span>
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 truncate">{crm.address}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <textarea className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-12 resize-none mt-1 custom-scrollbar" value={data.entities?.customer?.address || ''} onChange={e => updateEntity('customer', 'address', e.target.value)} placeholder="Morada Fiscal..." />
                        </div>

                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-green-900/50 transition-colors">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-green-600 font-bold uppercase tracking-wider">Entrega / Ship To</label>
                            <input
                                className="w-full bg-transparent border-none outline-none font-bold text-green-100 placeholder-white/10"
                                value={data.entities?.shipTo?.name || ''}
                                onChange={e => updateEntity('shipTo', 'name', e.target.value)}
                                placeholder="Nome do Destinatário"
                            />
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[10px] text-gray-400 h-16 resize-none mt-1 leading-snug custom-scrollbar"
                                value={data.entities?.shipTo?.address || data.entities?.customer?.address || ''}
                                onChange={e => updateEntity('shipTo', 'address', e.target.value)}
                                placeholder="Morada de Entrega..."
                            />
                        </div>

                        <div className="border border-[#333] rounded p-2 bg-[#151515] relative group hover:border-yellow-900/50 transition-colors flex flex-col gap-2">
                            <label className="absolute -top-2 left-2 bg-[#1a1a1a] px-1 text-[9px] text-yellow-600 font-bold uppercase tracking-wider">Projeto & Meta</label>
                            <div className="flex justify-between items-center"><span className="text-[10px] text-gray-500 uppercase">Doc Nº</span><input className="w-24 bg-[#0f0f0f] border border-[#333] px-1 text-right font-mono text-yellow-500 font-bold rounded focus:border-yellow-500 outline-none" value={data.docNumber || ''} onChange={e => updateHeader('docNumber', e.target.value)} /></div>
                            <div className="flex justify-between items-center"><span className="text-[10px] text-gray-500 uppercase">Data</span><input className="w-24 bg-[#0f0f0f] border border-[#333] px-1 text-right font-mono text-gray-300 rounded focus:border-yellow-500 outline-none" value={data.date || ''} onChange={e => updateHeader('date', e.target.value)} /></div>
                            <div className="flex justify-between items-center"><span className="text-[10px] text-gray-500 uppercase">Projeto</span><input className="w-24 bg-[#0f0f0f] border border-[#333] px-1 text-right text-[10px] text-gray-300 rounded focus:border-yellow-500 outline-none" value={satelliteData.customerRef || ''} onChange={e => setSatelliteData({ ...satelliteData, customerRef: e.target.value })} /></div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-[#121212] custom-scrollbar p-0 relative">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#1f1f1f] text-[10px] uppercase text-gray-500 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-2 w-10 text-center border-r border-[#333]">#</th>
                                    <th className="p-2 w-32 border-r border-[#333]">SKU</th>
                                    <th className="p-2 border-r border-[#333]">Descrição (Click to Expand)</th>
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
                                        <td className="p-0 border-r border-[#222]"><input className="w-full h-full bg-transparent px-2 py-2 outline-none text-yellow-500 font-mono font-bold focus:bg-[#222]" value={line.code || ''} onChange={e => updateLine(idx, 'code', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full h-full bg-transparent px-2 py-2 outline-none text-gray-300 focus:bg-[#222]" value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full h-full bg-transparent px-1 py-2 outline-none text-center text-blue-300 font-bold focus:bg-[#222]" value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full h-full bg-transparent px-2 py-2 outline-none text-right font-mono text-gray-400 focus:bg-[#222]" value={line.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} /></td>
                                        <td className="p-0 border-r border-[#222]"><input className="w-full h-full bg-transparent px-1 py-2 outline-none text-center text-red-400 focus:bg-[#222]" value={line.discountPercent || ''} onChange={e => updateLine(idx, 'discountPercent', e.target.value)} /></td>
                                        <td className="p-2 text-right font-mono font-bold text-gray-200 bg-[#151515] group-hover:bg-[#1a1a1a]">{line.total} €</td>
                                    </tr>
                                ))}
                                {filteredLines.length === 0 && (
                                    <tr><td colSpan="7" className="p-12 text-center text-gray-600 italic">Nenhum artigo encontrado. Use a extração Poppler ou adicione manualmente.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="h-16 bg-[#161616] border-t border-[#333] flex items-center justify-between px-6 shadow-2xl z-20">
                        <div className="w-1/2"><input className="w-full bg-transparent border-none outline-none text-[10px] text-gray-500 italic placeholder-gray-700" placeholder="Notas internas ou observações..." value={data.notes || ''} onChange={e => updateHeader('notes', e.target.value)} /></div>
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col items-end"><span className="text-[9px] uppercase font-bold text-gray-600">Subtotal</span><span className="font-mono text-gray-400">{data.totals?.net || '0.00'} €</span></div>
                            <div className="flex flex-col items-end group"><span className="text-[9px] uppercase font-bold text-gray-600 group-hover:text-blue-500 cursor-pointer">Portes (Edit)</span><input className="bg-transparent border-b border-[#333] w-16 text-right font-mono text-gray-300 outline-none focus:border-blue-500" value={data.totals?.transport || '0.00'} onChange={e => {
                                const val = e.target.value;
                                const newTotals = { ...data.totals, transport: val };
                                // Robust net/subtotal lookup
                                const net = parseFloat(newTotals.net || newTotals.goods || newTotals.subtotal || 0) || 0;
                                const vat = parseFloat(newTotals.vat || newTotals.tax || 0) || 0;
                                const trans = parseFloat(val || 0) || 0;
                                newTotals.gross = (net + vat + trans).toFixed(2);
                                setSatelliteData({ ...satelliteData, totals: newTotals });
                            }} /></div>
                            <div className="flex flex-col items-end"><span className="text-[9px] uppercase font-bold text-gray-600">Total Final</span><span className="font-mono text-xl font-bold text-yellow-500">{data.totals?.gross || '0.00'} €</span></div>
                            <button
                                className="px-4 py-2 bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded hover:bg-blue-900/60 transition-colors flex items-center gap-2"
                                onClick={async () => {
                                    const ok = await onSave(satelliteData);
                                    if (ok) alert("Rascunho guardado!");
                                }}
                                disabled={saving}
                            >
                                💾 {saving ? 'A gravar...' : 'Guardar'}
                            </button>
                            <button className={`${mode === 'archive' ? 'bg-gray-700' : 'bg-green-700 hover:bg-green-600'} text-white font-bold px-6 py-2 rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2`} onClick={mode === 'archive' ? onClose : onFinalize}>{mode === 'archive' ? <span>✔ FECHAR</span> : <span>✔ FINALIZAR</span>}</button>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: styles }} />
        </div>,
        document.body
    );
}

const styles = `
.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #121212; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
`;
