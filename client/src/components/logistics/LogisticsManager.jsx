import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/apiClient';
import { fmtEUR } from '../../shared/ui';
import { FiPlus, FiTrash2, FiSearch, FiChevronDown, FiSettings, FiClock, FiCalendar } from 'react-icons/fi';

/**
 * Logistics Manager Drawer.
 * Allows setting Global Dates, Lead Times, and managing Line Item Exceptions.
 */
export default function LogisticsManager({ proposalId, onClose }) {
    const [proposal, setProposal] = useState(null);
    const [header, setHeader] = useState({});
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [calculating, setCalculating] = useState(false);

    // Lead Time Rules (Universal Control)
    const [rules, setRules] = useState([]); // [{ target: 'global'|'collection:X', value: 8, unit: 'weeks' }]
    const [collections, setCollections] = useState([]);
    const [showCollectionSearch, setShowCollectionSearch] = useState(null); // rule index or null

    // Changes Tracking (for lines)
    const [pendingChanges, setPendingChanges] = useState({}); // { lineId: { field: value } }

    useEffect(() => {
        if (!proposalId) return;
        fetchData();
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; }
    }, [proposalId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/proposals/${proposalId}`);
            const data = res.data;
            setProposal(data);

            setHeader({
                order_confirmation_date: data.order_confirmation_date ? new Date(data.order_confirmation_date).toISOString().split('T')[0] : '',
                logistics_notes: data.logistics_notes || ''
            });

            // Parse Rules
            let rawRules = data.lead_time_rules ? (typeof data.lead_time_rules === 'string' ? JSON.parse(data.lead_time_rules) : data.lead_time_rules) : [];
            if (!Array.isArray(rawRules)) rawRules = [];

            // Ensure at least one global rule if empty
            if (rawRules.length === 0) {
                rawRules.push({ target: 'global', value: data.general_lead_time_weeks || 8, unit: 'weeks' });
            }
            setRules(rawRules);

            setLines(data.lines || []);
            setPendingChanges({});

            // Load Collections for ALL brands present in the lines
            const safeLines = Array.isArray(data.lines) ? data.lines : [];
            const lineBrands = safeLines.map(l => {
                const m = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                return m.brand_id || m.brand;
            });
            let uniqueBrands = [...new Set([data.brand_id, ...lineBrands].filter(Boolean))];

            if (uniqueBrands.includes('MULTIMARCAS')) {
                uniqueBrands = uniqueBrands.filter(b => b !== 'MULTIMARCAS');
                // Ensure we at least have nicolazzi/ritmonio if it was multimarca but lines are empty
                if (uniqueBrands.length === 0) uniqueBrands = ['nicolazzi', 'ritmonio'];
            }

            if (uniqueBrands.length > 0) {
                const collsRes = await Promise.all(uniqueBrands.map(b => api.get(`/api/catalog/collections?brand=${b.toLowerCase()}`).catch(() => ({ data: [] }))));
                const allColls = collsRes.map(res => res.data || []).flat();
                // Deduplicate by name
                const dedup = Array.from(new Map(allColls.map(c => [c.name, c])).values());
                setCollections(dedup);
            } else {
                setCollections([]);
            }
        } catch (err) {
            console.error(err);
            alert('Falha ao carregar dados: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RULE MANAGEMENT ---

    const handleAddRule = () => {
        setRules([...rules, { target: 'global', value: 8, unit: 'weeks' }]);
    };

    const handleRemoveRule = (index) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const updateRule = (index, field, value) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRules(newRules);
    };

    const saveSettings = async () => {
        try {
            setSaving(true);
            await api.put(`/api/proposals/${proposalId}/logistics`, {
                order_date: header.order_confirmation_date,
                notes: header.logistics_notes,
                rules: rules
            });
            await fetchData();
        } catch (err) {
            alert('Erro ao guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // --- ACTIONS ---

    const runAutoCategorize = async () => {
        try {
            setCalculating(true);
            await api.post(`/api/proposals/${proposalId}/logistics/auto-categorize`);
            await fetchData();
        } catch (err) {
            alert('Erro: ' + err.message);
        } finally {
            setCalculating(false);
        }
    };

    const handleLineChange = (lineId, field, value) => {
        setPendingChanges(prev => ({ ...prev, [lineId]: { ...(prev[lineId] || {}), [field]: value } }));
        setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
    };

    const saveLineChanges = async () => {
        const lineIds = Object.keys(pendingChanges);
        if (lineIds.length === 0) return;
        try {
            setSaving(true);
            const promises = lineIds.map(lid => api.post(`/api/proposals/${proposalId}/logistics/lines`, {
                lineIds: [lid],
                updates: {
                    category: pendingChanges[lid].production_category,
                    lead_time_weeks: pendingChanges[lid].lead_time_weeks
                }
            }));
            await Promise.all(promises);
            setPendingChanges({});
            await fetchData();
        } catch (err) {
            alert('Erro nas linhas: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // --- HELPERS ---

    const renderDate = (d) => d ? new Date(d).toLocaleDateString() : '-';

    // Filtered Collections Search logic for a specific rule
    const RuleCollectionSelector = ({ index, currentTarget }) => {
        const [search, setSearch] = useState('');

        const availableData = useMemo(() => {
            const list = [
                { name: 'GLOBAL (Tudo)', target: 'global', group: 'Geral' },
                { name: 'CATEGORIA: Corpos Interiores', target: 'category:rough_parts', group: 'Categorias' },
                { name: 'CATEGORIA: Acabamentos (Externa)', target: 'category:finishings', group: 'Categorias' },
                { name: 'CATEGORIA: Standard / Acessórios', target: 'category:standard', group: 'Categorias' }
            ];

            // Add Collections
            collections.forEach(c => {
                list.push({ name: `COLEÇÃO: ${c.name}`, target: `collection:${c.name}`, group: 'Coleções' });
            });

            // Add unique finishes present in lines
            const lineFinishes = new Set();
            lines.forEach(l => {
                const m = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                const f = m.finish_code || m.finishCode || m.brand_meta?.finishCode;
                if (f) lineFinishes.add(f);
            });
            lineFinishes.forEach(f => {
                list.push({ name: `ACABAMENTO: ${f}`, target: `finish:${f}`, group: 'Acabamentos' });
            });

            return list;
        }, [collections, lines]);

        const filtered = useMemo(() => {
            if (!search) return availableData;
            return availableData.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.group.toLowerCase().includes(search.toLowerCase()));
        }, [search, availableData]);

        const selectedItem = availableData.find(f => f.target === currentTarget);
        const selectedLabel = selectedItem ? selectedItem.name : (currentTarget === 'global' ? 'GLOBAL (Tudo)' : currentTarget);

        return (
            <div className="relative">
                <button
                    onClick={() => setShowCollectionSearch(showCollectionSearch === index ? null : index)}
                    className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-white text-[11px] text-left flex justify-between items-center hover:border-orange-500 transition-colors"
                >
                    <span className="truncate font-bold">{selectedLabel}</span>
                    <FiChevronDown />
                </button>

                {showCollectionSearch === index && (
                    <div className="absolute top-full left-0 right-0 z-[13000] mt-1 bg-[#111] border border-[#333] shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[350px]">
                        <div className="p-2 border-b border-[#222] bg-[#0e0e0e]">
                            <div className="relative">
                                <FiSearch className="absolute left-2 top-2.5 text-gray-500" />
                                <input
                                    autoFocus
                                    className="w-full bg-[#050505] border border-[#222] rounded px-8 py-1.5 text-xs text-white outline-none focus:border-orange-500"
                                    placeholder="Procurar (Coleção, Acabamento, Categoria)..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto overflow-x-hidden p-1">
                            {['Geral', 'Categorias', 'Acabamentos', 'Coleções'].map(group => {
                                const groupItems = filtered.filter(f => f.group === group);
                                if (groupItems.length === 0) return null;
                                return (
                                    <div key={group} className="mb-2">
                                        <div className="px-3 py-1 text-[8px] font-black uppercase text-gray-600 tracking-widest">{group}</div>
                                        {groupItems.map(f => (
                                            <button
                                                key={f.target}
                                                onClick={() => {
                                                    updateRule(index, 'target', f.target);
                                                    setShowCollectionSearch(null);
                                                }}
                                                className={`w-full text-left px-3 py-1.5 text-[10px] rounded hover:bg-orange-500/10 transition-colors ${f.target === currentTarget ? 'bg-orange-500/20 text-orange-400 font-bold' : 'text-gray-400'}`}
                                            >
                                                {f.name}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[12000] bg-black/80 flex justify-end backdrop-blur-sm">
            <div className="w-[850px] h-full bg-[#111] border-l border-[#333] flex flex-col shadow-2xl animate-slide-in-right">

                {/* HEADER */}
                <div className="h-16 border-b border-[#333] flex items-center justify-between px-6 shrink-0 bg-[#0e0e0e]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                            <FiSettings size={20} />
                        </div>
                        <div>
                            <h2 className="text-gray-200 font-bold tracking-wider flex items-center gap-2">
                                GESTÃO LOGÍSTICA UNIVERSAL
                                <span className="text-[10px] bg-[#222] px-2 py-0.5 rounded text-gray-500 border border-[#333] font-mono">
                                    {proposal?.brand_id?.toUpperCase() || 'ANY'}
                                </span>
                            </h2>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Lead Time Policies & Fulfillment Optimization</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full">✕</button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {/* 1. ANCHOR DATE */}
                    <div className="bg-[#181818] border border-[#333] rounded-xl p-5 shadow-lg">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] mb-4 flex items-center gap-2">
                            <FiCalendar className="text-orange-500" /> Âncora Temporal
                        </h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1 tracking-wider">Data de Confirmação Fábrica</label>
                                <input
                                    type="date"
                                    value={header.order_confirmation_date}
                                    onChange={e => setHeader({ ...header, order_confirmation_date: e.target.value })}
                                    className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-2.5 text-white text-sm focus:border-orange-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex flex-col justify-end">
                                <p className="text-[11px] text-gray-500 italic leading-relaxed">
                                    Esta data serve de ponto de partida para todos os cálculos.
                                    Sem uma data de confirmação, os prazos não podem ser determinados.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. UNIVERSAL POLICY TABLE */}
                    <div className="bg-[#181818] border border-[#333] rounded-xl p-5 shadow-lg">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] flex items-center gap-2">
                                <FiClock className="text-orange-500" /> Políticas de Prazo (Lead Times)
                            </h3>
                            <button
                                onClick={handleAddRule}
                                className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                            >
                                <FiPlus /> Adicionar Regra
                            </button>
                        </div>

                        <div className="overflow-hidden border border-[#222] rounded-lg bg-[#0a0a0a]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#111] text-[9px] uppercase text-gray-500 font-bold">
                                    <tr>
                                        <th className="p-3 border-b border-[#222]">Agrupamento / Coleção</th>
                                        <th className="p-3 border-b border-[#222] w-24 text-center">Valor</th>
                                        <th className="p-3 border-b border-[#222] w-40">Unidade</th>
                                        <th className="p-3 border-b border-[#222] w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#181818]">
                                    {rules.map((rule, idx) => (
                                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="p-3">
                                                <RuleCollectionSelector index={idx} currentTarget={rule.target} />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    type="number"
                                                    value={rule.value}
                                                    onChange={e => updateRule(idx, 'value', parseFloat(e.target.value))}
                                                    className="w-full bg-[#111] border border-[#333] rounded px-2 py-2 text-xs text-center text-white outline-none focus:border-orange-500"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <select
                                                    value={rule.unit}
                                                    onChange={e => updateRule(idx, 'unit', e.target.value)}
                                                    className="w-full bg-[#111] border border-[#333] rounded px-2 py-2 text-xs text-gray-300 outline-none focus:border-orange-500"
                                                >
                                                    <option value="weeks">Semanas (Standard)</option>
                                                    <option value="months">Meses</option>
                                                    <option value="days">Dias Úteis</option>
                                                </select>
                                            </td>
                                            <td className="p-3 text-right">
                                                {rule.target !== 'global' && (
                                                    <button onClick={() => handleRemoveRule(idx)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                                                        <FiTrash2 />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={runAutoCategorize}
                                disabled={calculating}
                                className="px-5 py-2.5 bg-[#222] hover:bg-[#333] text-gray-300 border border-[#444] rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {calculating ? 'Detectando...' : 'Detector de Coleções'}
                            </button>
                            <button
                                onClick={saveSettings}
                                disabled={saving}
                                className="px-8 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-950/20 disabled:opacity-50"
                            >
                                {saving ? 'Processando...' : 'Aplicar & Recalcular'}
                            </button>
                        </div>
                    </div>

                    {/* 3. EXCEPTIONS DISPLAY (Simplified Table) */}
                    <div className="bg-[#181818] border border-[#333] rounded-xl p-5 shadow-lg flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[2px]">Previsões Individuais (Checklist)</h3>
                            {Object.keys(pendingChanges).length > 0 && (
                                <button
                                    onClick={saveLineChanges}
                                    className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-[9px] uppercase font-black animate-pulse"
                                >
                                    Salvar Alterações
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar border border-[#222] rounded bg-[#0a0a0a]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#111] text-[9px] uppercase text-gray-500 font-bold sticky top-0 z-20">
                                    <tr>
                                        <th className="p-3 border-b border-[#222] w-12 text-center">SKU</th>
                                        <th className="p-3 border-b border-[#222]">Artigo</th>
                                        <th className="p-3 border-b border-[#222] w-24 text-center">Marca</th>
                                        <th className="p-3 border-b border-[#222] w-32">Coleção</th>
                                        <th className="p-3 border-b border-[#222] w-28 text-center text-orange-400">Entrega Prevista</th>
                                        <th className="p-3 border-b border-[#222] w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#181818]">
                                    {lines.map(line => {
                                        const meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
                                        const series = meta.series || meta.collection || meta.brand_meta?.series || '-';
                                        const lineBrand = meta.brand_id || meta.brand || proposal.brand_id || '-';

                                        return (
                                            <tr key={line.id} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="p-3 text-[10px] font-mono text-gray-400">{line.sku}</td>
                                                <td className="p-3 py-4">
                                                    <div className="text-[10px] text-gray-300 font-bold line-clamp-1">{line.description}</div>
                                                    <div className="text-[9px] text-gray-500 mt-0.5">{line.production_category}</div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="text-[8px] bg-[#222] text-gray-400 px-2 py-0.5 rounded border border-[#333] uppercase font-mono">
                                                        {lineBrand}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-[10px] text-gray-400">
                                                    <span className="bg-[#181818] border border-[#333] px-2 py-0.5 rounded text-[9px] uppercase">
                                                        {series}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center text-[10px] font-mono font-bold text-orange-400">
                                                    {renderDate(line.predicted_ship_date)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {line.is_manual_override && <span className="text-[12px] text-yellow-500" title="Manual Override">🔒</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
                    .animate-slide-in-right { animation: slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #444; }
                `}} />

            </div>
        </div>,
        document.body
    );
}
