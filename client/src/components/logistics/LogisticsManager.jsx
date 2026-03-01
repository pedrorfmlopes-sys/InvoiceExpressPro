import React, { useEffect, useState, useMemo, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/apiClient';
import { fmtEUR } from '../../shared/ui';
import { FiPlus, FiTrash2, FiSearch, FiChevronDown, FiSettings, FiClock, FiCalendar, FiBox, FiDroplet, FiList, FiRefreshCw } from 'react-icons/fi';

/**
 * Logistics Manager Drawer.
 * Separated into Two Engines: 
 * Motor 1: Brand & Collection Policies
 * Motor 2: Finish-based Overrides
 */
export default function LogisticsManager({ proposalId, onClose }) {
    const [proposal, setProposal] = useState(null);
    const [header, setHeader] = useState({});
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [calculating, setCalculating] = useState(false);

    // Metadata
    const [rules, setRules] = useState([]);
    const [collections, setCollections] = useState([]);
    const [catalogFinishes, setCatalogFinishes] = useState([]); // All finishes from catalog for relevant brands
    const [showSelector, setShowSelector] = useState(null); // { type, index }

    // Multi-Brand State
    const [uniqueBrandsInLines, setUniqueBrandsInLines] = useState([]);
    const [selectedBrandMotor1, setSelectedBrandMotor1] = useState('all');
    const [selectedBrandMotor2, setSelectedBrandMotor2] = useState('all');

    // Drawer State
    const [brandFilter, setBrandFilter] = useState('all');
    const [collectionFilter, setCollectionFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Changes Tracking (for lines)
    const [pendingChanges, setPendingChanges] = useState({});
    const [hasChanges, setHasChanges] = useState(false);

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
                order_confirmation_date: data.order_confirmation_date
                    ? new Date(data.order_confirmation_date).toISOString().split('T')[0]
                    : (data.metadata?.doc_date
                        ? new Date(data.metadata.doc_date).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]),
                logistics_notes: data.logistics_notes || ''
            });

            // Parse Rules
            let rawRules = data.lead_time_rules ? (typeof data.lead_time_rules === 'string' ? JSON.parse(data.lead_time_rules) : data.lead_time_rules) : [];
            if (!Array.isArray(rawRules)) rawRules = [];
            setRules(rawRules);

            const safeLines = Array.isArray(data.lines) ? data.lines : [];
            setLines(safeLines);
            setPendingChanges({});

            // Identify Brands
            const brandsFound = new Set();
            safeLines.forEach(l => {
                const m = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                const b = (m.brand_id || m.brand || data.brand_id || 'Nicolazzi').toUpperCase();
                brandsFound.add(b);
            });
            const uniqueBrands = [...brandsFound].sort();
            setUniqueBrandsInLines(uniqueBrands);

            if (selectedBrandMotor1 === 'all' && uniqueBrands.length > 0) setSelectedBrandMotor1(uniqueBrands[0]);
            if (selectedBrandMotor2 === 'all' && uniqueBrands.length > 0) setSelectedBrandMotor2(uniqueBrands[0]);

            // Load Metadata from Catalog (Collections & Finishes)
            if (uniqueBrands.length > 0) {
                const collsRes = await Promise.all(uniqueBrands.map(b => api.get(`/api/catalog/collections?brand=${b.toLowerCase()}`).catch(() => ({ data: [] }))));
                const allColls = collsRes.map((r, idx) => (r.data || []).map(c => ({ ...c, brand: uniqueBrands[idx] }))).flat();
                setCollections(allColls);

                const finishesRes = await Promise.all(uniqueBrands.map(b => api.get(`/api/catalog/finishes/${b.toLowerCase()}`).catch(() => ({ data: [] }))));
                const allFinishes = finishesRes.map((r, idx) => (r.data || []).map(f => ({ ...f, brand: uniqueBrands[idx] }))).flat();
                setCatalogFinishes(allFinishes);
            }
        } catch (err) {
            console.error(err);
            alert('Falha ao carregar dados: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RULE MANAGEMENT ---

    const handleAddRule = (type, forcedBrand = null) => {
        let target = 'global';
        const brand = (forcedBrand && forcedBrand !== 'all') ? forcedBrand.toLowerCase() : (proposal?.brand_id || 'any').toLowerCase();

        if (type === 'brand') target = `brand:${brand}`;
        if (type === 'collection') target = `collection:${brand}:null`;
        if (type === 'finish') target = `finish:${brand}:null`;

        const newRules = [...rules, { target, value: 8, unit: 'weeks' }];
        setRules(newRules);
        setHasChanges(true);
        handlePreview(null, newRules);
    };

    const handleRemoveRule = (index) => {
        const nextRules = rules.filter((_, i) => i !== index);
        setRules(nextRules);
        setHasChanges(true);
        handlePreview(null, nextRules);
    };

    const updateRule = (index, field, value) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRules(newRules);
        setHasChanges(true);
        handlePreview(null, newRules);
    };

    const handlePreview = async (overrides = null, currentRules = null, currentAnchor = null) => {
        try {
            setCalculating(true);
            const res = await api.post(`/api/proposals/${proposalId}/logistics/calculate-preview`, {
                order_date: currentAnchor || header.order_confirmation_date,
                rules: currentRules || rules,
                manual_overrides: Object.keys(overrides || pendingChanges).map(id => ({
                    id,
                    ...(overrides ? overrides[id] : pendingChanges[id])
                }))
            });
            if (res.data.success) {
                setLines(prev => prev.map(l => {
                    const found = res.data.lines.find(rl => String(rl.id) === String(l.id));
                    return found ? { ...l, ...found } : l;
                }));
            }
        } catch (err) {
            console.error("[LogisticsPreview] Error:", err);
        } finally {
            setCalculating(false);
        }
    };

    const saveSettings = async () => {
        try {
            setSaving(true);
            await api.put(`/api/proposals/${proposalId}/logistics`, {
                order_date: header.order_confirmation_date,
                notes: header.logistics_notes,
                rules: rules
            });

            const lineIds = Object.keys(pendingChanges);
            if (lineIds.length > 0) {
                await Promise.all(lineIds.map(lid => {
                    const changes = pendingChanges[lid];
                    return api.post(`/api/proposals/${proposalId}/logistics/lines`, {
                        lineIds: [lid],
                        updates: {
                            lead_time_weeks: changes.lead_time_weeks,
                            manual_override: true
                        }
                    });
                }));
            }

            setPendingChanges({});
            setHasChanges(false);
            await api.post(`/api/proposals/${proposalId}/logistics/calculate`);
            alert('Dados gravados com sucesso!');
            onClose();
        } catch (err) {
            alert('Erro ao guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const runAutoSync = async (brandId) => {
        if (!brandId || brandId === 'all') return;
        try {
            setCalculating(true);
            const res = await api.get(`/api/catalog/finishes/${brandId.toLowerCase()}`);
            const brandCatalog = res.data || [];

            // Finishes present in lines for this brand
            const lineFinishes = [...new Set(lines
                .filter(l => {
                    const m = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                    const b = (m.brand_id || m.brand || proposal.brand_id || '').toLowerCase();
                    return b === brandId.toLowerCase();
                })
                .map(l => {
                    const m = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                    return m.finish_code || m.finishCode || m.brand_meta?.finishCode;
                })
                .filter(Boolean)
            )];

            let newRules = [...rules];
            lineFinishes.forEach(fCode => {
                const catInfo = brandCatalog.find(cf => cf.finish_code === fCode);
                if (catInfo) {
                    // Read lead time directly from the DB column (migrated from legacy note_pt)
                    const leadTime = catInfo.lead_time_weeks ?? 8;
                    const unit = catInfo.lead_time_unit || 'weeks';

                    const target = `finish:${brandId.toLowerCase()}:${fCode.toLowerCase()}`;
                    const existingIdx = newRules.findIndex(r => r.target.toLowerCase() === target);
                    if (existingIdx >= 0) {
                        newRules[existingIdx] = { ...newRules[existingIdx], value: leadTime, unit };
                    } else {
                        newRules.push({ target, value: leadTime, unit });
                    }
                }
            });

            setRules(newRules);
            setHasChanges(true);
            handlePreview(null, newRules);
            alert(`Sincronizados ${lineFinishes.length} acabamentos para ${brandId}.`);
        } catch (err) {
            alert('Erro na sincronização: ' + err.message);
        } finally {
            setCalculating(false);
        }
    };

    // --- RENDER HELPERS ---

    const memoLines = useMemo(() => {
        return lines.filter(l => {
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                const meta = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
                const series = (meta.series || meta.collection || meta.brand_meta?.series || '').toLowerCase();
                return (l.sku || '').toLowerCase().includes(s) || (l.description || '').toLowerCase().includes(s) || series.includes(s);
            }
            const meta = l.extra_attributes ? (typeof l.extra_attributes === 'string' ? JSON.parse(l.extra_attributes) : l.extra_attributes) : {};
            const lineBrand = (meta.brand_id || meta.brand || proposal?.brand_id || 'Nicolazzi').toUpperCase();
            const series = meta.series || meta.collection || meta.brand_meta?.series || 'Outros';

            if (brandFilter !== 'all' && lineBrand !== brandFilter) return false;
            if (collectionFilter !== 'all' && series !== collectionFilter) return false;
            return true;
        });
    }, [lines, brandFilter, collectionFilter, searchTerm, proposal]);

    const UniversalSelector = ({ index, currentTarget, type, motor, activeBrand = null }) => {
        const [filter, setFilter] = useState('');
        const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
        const buttonRef = useRef(null);

        const available = useMemo(() => {
            const list = [];
            const b = (activeBrand && activeBrand !== 'all') ? activeBrand.toUpperCase() : null;

            if (type === 'collection') {
                collections.forEach(c => {
                    if (!b || c.brand.toUpperCase() === b) {
                        list.push({ name: `Coleção: ${c.name}`, target: `collection:${c.brand.toLowerCase()}:${c.name.toLowerCase()}` });
                    }
                });
            } else if (type === 'finish') {
                catalogFinishes.forEach(f => {
                    if (!b || f.brand.toUpperCase() === b) {
                        list.push({ name: `Acabamento: ${f.finish_code} (${f.name_en || f.name_it || ''})`, target: `finish:${f.brand.toLowerCase()}:${f.finish_code.toLowerCase()}` });
                    }
                });
            }
            return list;
        }, [type, activeBrand, collections, catalogFinishes]);

        const isOpen = showSelector?.index === index && showSelector?.motor === motor;

        useLayoutEffect(() => {
            if (isOpen && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setCoords({ top: rect.bottom, left: rect.left, width: rect.width });
            }
        }, [isOpen, showSelector]);

        const filtered = available.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
        const selected = available.find(a => a.target.toLowerCase() === currentTarget.toLowerCase());
        const label = selected ? selected.name : "Selecionar Alvo...";

        return (
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={() => setShowSelector(isOpen ? null : { type, index, motor })}
                    className={`w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 text-white text-[10px] text-left flex justify-between items-center hover:border-orange-500 transition-colors ${isOpen ? 'border-orange-500 ring-1 ring-orange-500/20' : ''}`}
                >
                    <span className="truncate font-bold text-gray-300">{label}</span>
                    <FiChevronDown className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180 text-orange-500' : ''}`} />
                </button>
                {isOpen && createPortal(
                    <div
                        className="fixed z-[30000] mt-1 bg-[#111] border border-[#333] shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[300px]"
                        style={{ top: coords.top, left: coords.left, width: coords.width }}
                    >
                        <div className="p-2 border-b border-[#222] bg-[#0e0e0e]">
                            <div className="relative">
                                <FiSearch className="absolute left-2 top-2.5 text-gray-600" size={12} />
                                <input
                                    autoFocus
                                    className="w-full bg-[#050505] border border-[#222] rounded pl-8 pr-2 py-1.5 text-[10px] text-white outline-none focus:border-orange-500"
                                    placeholder="Pesquisar..."
                                    value={filter}
                                    onChange={e => setFilter(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                            {filtered.length === 0 && <div className="p-3 text-[10px] text-gray-600 italic">Nenhuma opção encontrada...</div>}
                            {filtered.map(a => (
                                <button
                                    key={a.target}
                                    onClick={() => { updateRule(index, 'target', a.target); setShowSelector(null); }}
                                    className={`w-full text-left px-3 py-2 text-[10px] rounded hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${a.target.toLowerCase() === currentTarget.toLowerCase() ? 'text-orange-400 font-black bg-orange-500/10' : 'text-gray-400 font-bold'}`}
                                >
                                    {a.name}
                                </button>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    };

    // --- Helper for reactive display ---
    const getAppliedRule = (line, meta) => {
        const fb = (meta.brand_id || meta.brand || proposal?.brand_id || 'Nicolazzi').toLowerCase().trim();
        const fs = (meta.series || meta.collection || meta.brand_meta?.series || '').toLowerCase().trim();
        const ff = (meta.finish_code || meta.finishCode || meta.brand_meta?.finishCode || '').toLowerCase().trim();
        const fc = (line.production_category || '').toLowerCase().trim();

        const rule =
            rules.find(r => ff && r.target.toLowerCase() === `finish:${fb}:${ff}`) ||
            rules.find(r => fs && r.target.toLowerCase() === `collection:${fb}:${fs}`) ||
            rules.find(r => fc && r.target.toLowerCase() === `category:${fb}:${fc}`) ||
            rules.find(r => r.target.toLowerCase() === `brand:${fb}`) ||
            // Legacy/Agnostic
            rules.find(r => ff && r.target.toLowerCase() === `finish:${ff}`) ||
            rules.find(r => fs && r.target.toLowerCase() === `collection:${fs}`) ||
            rules.find(r => fc && r.target.toLowerCase() === `category:${fc}`) ||
            rules.find(r => r.target.toLowerCase() === 'global');

        return rule;
    };

    const handleLineChange = (lineId, field, value) => {
        const newValue = parseFloat(value) || 0;
        setPendingChanges(prev => ({ ...prev, [lineId]: { ...(prev[lineId] || {}), [field]: newValue, manual_override: true } }));
        setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: newValue, is_manual_override: 1 } : l));
        setHasChanges(true);
        handlePreview({ ...pendingChanges, [lineId]: { [field]: newValue, manual_override: true } });
    };

    const RuleRow = ({ rule, idx, motor, activeBrand }) => (
        <tr className="hover:bg-white/[0.02] transition-colors group">
            <td className="p-2">
                {rule.target === 'global' ?
                    <div className="px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#0a0a0a] rounded border border-[#222] opacity-60">Global (Todas as Marcas)</div> :
                    rule.target.startsWith('brand:') ?
                        <div className="px-3 py-1.5 text-[10px] font-black text-orange-400 uppercase bg-[#0a0a0a] rounded border border-orange-500/20">Toda a Marca: {rule.target.split(':')[1].toUpperCase()}</div> :
                        <UniversalSelector index={idx} motor={motor} currentTarget={rule.target} type={rule.target.startsWith('finish:') ? 'finish' : 'collection'} activeBrand={activeBrand} />
                }
            </td>
            <td className="p-2 w-16">
                <input
                    type="number"
                    value={rule.value ?? 0}
                    onChange={e => updateRule(idx, 'value', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-[10px] text-center text-white outline-none focus:border-orange-500 font-bold"
                />
            </td>
            <td className="p-2 w-28">
                <select
                    value={rule.unit}
                    onChange={e => updateRule(idx, 'unit', e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-[10px] text-gray-400 outline-none focus:border-orange-500 font-bold"
                >
                    <option value="weeks">Semanas</option>
                    <option value="days">Dias Úteis</option>
                </select>
            </td>
            <td className="p-2 w-8 text-right">
                {rule.target !== 'global' && (
                    <button onClick={() => handleRemoveRule(idx)} className="p-1.5 text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <FiTrash2 size={12} />
                    </button>
                )}
            </td>
        </tr>
    );

    return createPortal(
        <div className="fixed inset-0 z-[12000] bg-black/80 flex justify-end backdrop-blur-sm">
            <div className="w-[1050px] h-full bg-[#111] border-l border-[#333] flex flex-col shadow-2xl animate-slide-in-right">

                {/* HEADER */}
                <div className="h-14 border-b border-[#333] flex items-center justify-between px-6 shrink-0 bg-[#0e0e0e]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-orange-500/10 flex items-center justify-center text-orange-500">
                            <FiSettings size={16} />
                        </div>
                        <div>
                            <h2 className="text-gray-200 text-xs font-black tracking-widest uppercase">Motor Logístico Universal</h2>
                            <p className="text-[9px] text-gray-600 uppercase font-black">Multi-Engine Lead Time Management (Agnostic System)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

                    {/* ANCHOR */}
                    <div className="bg-[#181818] border border-[#333] rounded-lg p-3 flex items-center gap-6 shadow-lg shadow-black/20">
                        <div className="shrink-0 flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-[#333] pr-6">
                            <FiCalendar className="text-orange-500" /> Âncora Temporal
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-[9px] text-gray-600 uppercase font-black">Confirmação Fábrica:</label>
                            <input
                                type="date"
                                value={header.order_confirmation_date || ''}
                                onChange={e => {
                                    setHeader({ ...header, order_confirmation_date: e.target.value });
                                    handlePreview(null, rules, e.target.value);
                                    setHasChanges(true);
                                }}
                                className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 text-white text-xs outline-none focus:border-orange-500 font-bold transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">

                        {/* MOTOR 1: COLLECTIONS */}
                        <div className="bg-[#181818] border border-[#333] rounded-lg p-4 flex flex-col gap-3 shadow-lg shadow-black/20">
                            <div className="flex justify-between items-center bg-[#0a0a0a] p-2 rounded border border-[#222]">
                                <div className="flex items-center gap-2 text-[10px] font-black text-orange-500 uppercase tracking-wider">
                                    <FiBox /> Motor 1: Marcas / Coleções
                                </div>
                                <select
                                    className="bg-[#111] border border-[#333] text-gray-300 text-[10px] px-3 py-1 rounded outline-none font-black uppercase"
                                    value={selectedBrandMotor1}
                                    onChange={e => setSelectedBrandMotor1(e.target.value)}
                                >
                                    <option value="all">Todas as Marcas</option>
                                    {uniqueBrandsInLines.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>

                            <div className="flex-1 overflow-auto max-h-[300px] bg-[#0a0a0a] border border-[#222] rounded custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead className="bg-[#111] text-[9px] text-gray-600 font-black uppercase sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 border-b border-[#222]">Alvo de Controle</th>
                                            <th className="p-3 border-b border-[#222] w-16 text-center">Lead Time</th>
                                            <th className="p-3 border-b border-[#222] w-28 text-center">Unidade</th>
                                            <th className="p-3 border-b border-[#222] w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#181818]">
                                        {rules.filter(r => r.target === 'global' || r.target.startsWith('brand:')).map((r, i) => (
                                            <RuleRow key={`g-${i}`} rule={r} idx={rules.indexOf(r)} motor="motor1" activeBrand={selectedBrandMotor1} />
                                        ))}
                                        {rules.filter(r => {
                                            const parts = r.target.split(':');
                                            if (parts[0] !== 'category') return false;
                                            if (parts.length === 2) return true; // Legacy
                                            return selectedBrandMotor1 === 'all' || parts[1].toUpperCase() === selectedBrandMotor1;
                                        }).map((r, i) => (
                                            <RuleRow key={`cat-${i}`} rule={r} idx={rules.indexOf(r)} motor="motor1" activeBrand={selectedBrandMotor1} />
                                        ))}
                                        {rules.filter(r => {
                                            const parts = r.target.split(':');
                                            if (parts[0] !== 'collection') return false;
                                            if (parts.length === 2) return true; // Legacy
                                            return selectedBrandMotor1 === 'all' || parts[1].toUpperCase() === selectedBrandMotor1;
                                        }).map((r, i) => (
                                            <RuleRow key={`c-${i}`} rule={r} idx={rules.indexOf(r)} motor="motor1" activeBrand={selectedBrandMotor1} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleAddRule('brand', selectedBrandMotor1)} className="flex-1 py-1.5 bg-[#222] hover:bg-[#282828] text-[9px] font-black text-gray-500 uppercase rounded border border-[#333] transition-all">+ POLÍTICA MARCA</button>
                                <button onClick={() => handleAddRule('collection', selectedBrandMotor1)} className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[9px] font-black uppercase rounded shadow-lg transition-all">+ POLÍTICA COLEÇÃO</button>
                            </div>
                        </div>

                        {/* MOTOR 2: FINISHES */}
                        <div className="bg-[#181818] border border-[#333] rounded-lg p-4 flex flex-col gap-3 shadow-lg shadow-black/20">
                            <div className="flex justify-between items-center bg-[#0a0a0a] p-2 rounded border border-[#222]">
                                <div className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-wider">
                                    <FiDroplet /> Motor 2: Acabamentos
                                </div>
                                <select
                                    className="bg-[#111] border border-[#333] text-gray-300 text-[10px] px-3 py-1 rounded outline-none font-black uppercase"
                                    value={selectedBrandMotor2}
                                    onChange={e => setSelectedBrandMotor2(e.target.value)}
                                >
                                    <option value="all">Todas as Marcas</option>
                                    {uniqueBrandsInLines.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>

                            <div className="flex-1 overflow-auto max-h-[300px] bg-[#0a0a0a] border border-[#222] rounded custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead className="bg-[#111] text-[9px] text-gray-600 font-black uppercase sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 border-b border-[#222]">Alvo (Acabamento / Coleção Fallback)</th>
                                            <th className="p-3 border-b border-[#222] w-16 text-center">Lead Time</th>
                                            <th className="p-3 border-b border-[#222] w-28 text-center">Unidade</th>
                                            <th className="p-3 border-b border-[#222] w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#181818]">
                                        {/* Finish rules */}
                                        {rules.filter(r => {
                                            const parts = r.target.split(':');
                                            if (parts[0] !== 'finish') return false;
                                            if (parts.length === 2) return true; // Legacy
                                            return selectedBrandMotor2 === 'all' || parts[1].toUpperCase() === selectedBrandMotor2;
                                        }).map((r, i) => (
                                            <RuleRow key={`f-${i}`} rule={r} idx={rules.indexOf(r)} motor="motor2" activeBrand={selectedBrandMotor2} />
                                        ))}
                                        {/* Collection fallback rules for this brand */}
                                        {rules.some(r => {
                                            const parts = r.target.split(':');
                                            if (parts[0] !== 'collection') return false;
                                            return selectedBrandMotor2 === 'all' || (parts[1] && parts[1].toUpperCase() === selectedBrandMotor2);
                                        }) && (
                                                <tr><td colSpan={4} className="px-3 pt-3 pb-1">
                                                    <span className="text-[8px] text-blue-500/60 font-black uppercase tracking-widest">▾ Fallback por Coleção</span>
                                                </td></tr>
                                            )}
                                        {rules.filter(r => {
                                            const parts = r.target.split(':');
                                            if (parts[0] !== 'collection') return false;
                                            return selectedBrandMotor2 === 'all' || (parts[1] && parts[1].toUpperCase() === selectedBrandMotor2);
                                        }).map((r, i) => (
                                            <RuleRow key={`coll-fb-${i}`} rule={r} idx={rules.indexOf(r)} motor="motor2" activeBrand={selectedBrandMotor2} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => runAutoSync(selectedBrandMotor2)} disabled={selectedBrandMotor2 === 'all' || calculating} className="shrink-0 flex items-center justify-center p-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded text-blue-400 disabled:opacity-30 transition-all" title="Sincronizar prazos do catálogo para a marca selecionada">
                                    <FiRefreshCw className={calculating ? 'animate-spin' : ''} size={14} />
                                </button>
                                <button onClick={() => handleAddRule('finish', selectedBrandMotor2)} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase rounded shadow-lg transition-all">+ ACABAMENTO</button>
                                <button onClick={() => handleAddRule('collection', selectedBrandMotor2)} className="flex-1 py-1.5 bg-blue-900/60 hover:bg-blue-800/60 text-blue-300 text-[9px] font-black uppercase rounded border border-blue-700/40 transition-all" title="Adicionar regra de coleção como fallback para acabamentos">+ COLEÇÃO (Fallback)</button>
                            </div>
                        </div>
                    </div>

                    {/* LISTING */}
                    <div className="bg-[#181818] border border-[#333] rounded-lg p-5 flex flex-col min-h-[400px] gap-4 shadow-xl">
                        <div className="flex justify-between items-center bg-[#0a0a0a] p-3 rounded-lg border border-[#222]">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[3px] flex items-center gap-2"><FiList /> PANORAMA GERAL DO DOCUMENTO</h3>
                            <div className="flex gap-4">
                                <div className="relative">
                                    <FiSearch className="absolute left-3 top-2.5 text-gray-700" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Pesquisar SKU, Coleção ou Descrição..."
                                        className="bg-[#050505] border border-[#222] rounded-md pl-10 pr-4 py-2 text-[10px] text-white outline-none focus:border-orange-500 w-80 placeholder-gray-800 font-bold"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="bg-[#050505] border border-[#222] text-gray-500 text-[10px] px-4 py-1.5 rounded-md outline-none font-black uppercase tracking-wider"
                                    value={brandFilter}
                                    onChange={e => setBrandFilter(e.target.value)}
                                >
                                    <option value="all">Todas as Marcas</option>
                                    {uniqueBrandsInLines.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto border border-[#222] rounded bg-[#0a0a0a] custom-scrollbar">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead className="bg-[#111] text-[9px] uppercase text-gray-600 font-black sticky top-0 z-20">
                                    <tr>
                                        <th className="p-4 border-b border-[#222] w-20 text-center">SKU</th>
                                        <th className="p-4 border-b border-[#222]">Artigo / Acabamento</th>
                                        <th className="p-4 border-b border-[#222] w-24 text-center">Marca</th>
                                        <th className="p-4 border-b border-[#222] w-32">Coleção</th>
                                        <th className="p-4 border-b border-[#222] w-20 text-center">L.T (Sems)</th>
                                        <th className="p-4 border-b border-[#222] w-40">Regra Aplicada</th>
                                        <th className="p-4 border-b border-[#222] w-32 text-center text-orange-500">Expedição Prevista</th>
                                        <th className="p-4 border-b border-[#222] w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#181818]">
                                    {memoLines.map(line => {
                                        const meta = line.extra_attributes ? (typeof line.extra_attributes === 'string' ? JSON.parse(line.extra_attributes) : line.extra_attributes) : {};
                                        const series = meta.series || meta.collection || meta.brand_meta?.series || '-';
                                        const lineBrandId = (meta.brand_id || meta.brand || proposal?.brand_id || 'Nicolazzi').toLowerCase();
                                        const lineBrand = lineBrandId.toUpperCase();

                                        return (
                                            <tr key={line.id} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="p-4 text-[10px] font-mono text-gray-600 text-center border-r border-white/5">{line.sku}</td>
                                                <td className="p-4">
                                                    <div className="text-[10px] text-gray-400 font-bold leading-tight truncate max-w-[450px]">{line.description}</div>
                                                    <div className="inline-block mt-1 bg-white/5 px-2 py-0.5 rounded text-[8px] text-gray-500 uppercase font-black tracking-widest">{line.finish_code || meta.finishCode || 'STANDARD'}</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="text-[9px] bg-[#1a1a1a] text-gray-500 px-2 py-1 rounded border border-[#222] uppercase font-black">{lineBrand}</span>
                                                </td>
                                                <td className="p-4 text-[10px] text-gray-500 font-bold truncate">{series}</td>
                                                <td className="p-4 text-center">
                                                    {(() => {
                                                        const applied = getAppliedRule(line, meta);
                                                        const isManual = !!line.is_manual_override;
                                                        const displayValue = isManual ? (line.lead_time_weeks ?? 0) : (applied ? applied.value : (line.lead_time_weeks ?? 0));

                                                        return (
                                                            <input
                                                                type="number"
                                                                value={displayValue}
                                                                onChange={e => handleLineChange(line.id, 'lead_time_weeks', e.target.value)}
                                                                className={`w-12 bg-[#111] border rounded px-1 py-1 text-[11px] text-center transition-all font-black ${isManual ? 'border-yellow-600/50 text-yellow-500' : 'border-[#222] text-white'}`}
                                                            />
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4">
                                                    {(() => {
                                                        const applied = getAppliedRule(line, meta);

                                                        // if (line.sku === 'C2177DXDX') console.log(`C2177DXDX -> Cat: ${fc}, Coll: ${fs}, Rule: ${applied?.target}`);

                                                        if (line.is_manual_override) return <span className="text-[8px] text-yellow-600 font-black uppercase tracking-tighter">🔒 OVERRIDE MANUAL</span>;
                                                        if (!applied) return <span className="text-[8px] text-gray-700 font-black uppercase italic">Sem Regra (Fallback)</span>;

                                                        const targetParts = applied.target.split(':');
                                                        let label = 'REGRA';
                                                        if (applied.target === 'global') label = 'GLOBAL';
                                                        else if (targetParts[0] === 'brand') label = `MARCA: ${targetParts[1].toUpperCase()}`;
                                                        else if (targetParts[0] === 'category') label = `TIPO: ${(targetParts[2] || targetParts[1]).toUpperCase()}`;
                                                        else if (targetParts[0] === 'collection') label = `COLEÇÃO: ${(targetParts[2] || targetParts[1]).toUpperCase()}`;
                                                        else if (targetParts[0] === 'finish') label = `ACAB: ${(targetParts[2] || targetParts[1]).toUpperCase()}`;

                                                        // console.log(`Line SKU: ${line.sku}, Applied Rule: ${applied.target}, Label: ${label}`); // Debugging line
                                                        return <span className="text-[8px] text-blue-400 font-black uppercase tracking-tight">{label}</span>;
                                                    })()}
                                                </td>
                                                <td className="p-4 text-center text-[10px] font-mono font-black text-orange-500 bg-orange-500/[0.02]">
                                                    {line.predicted_ship_date ? new Date(line.predicted_ship_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {!!line.is_manual_override && (
                                                        <button
                                                            onClick={() => {
                                                                const nextPending = { ...pendingChanges };
                                                                delete nextPending[line.id];
                                                                setPendingChanges(nextPending);
                                                                const revertPending = { ...nextPending, [line.id]: { manual_override: false } };
                                                                setLines(prev => prev.map(l => l.id === line.id ? { ...l, is_manual_override: 0 } : l));
                                                                handlePreview(revertPending);
                                                            }}
                                                            className="text-yellow-600 hover:text-red-500 transition-colors"
                                                            title="Reverter para as Regras"
                                                        >
                                                            🔒
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="h-20 border-t border-[#333] flex items-center justify-between px-8 bg-[#0e0e0e] shrink-0">
                    <div className="flex items-center gap-4">
                        {hasChanges && (
                            <div className="flex items-center gap-2 bg-orange-500/10 px-4 py-2 rounded-full border border-orange-500/20">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                <span className="text-[10px] text-orange-400 font-black uppercase tracking-widest">Alterações Por Gravar</span>
                            </div>
                        )}
                        {calculating && <span className="text-[10px] text-blue-500 font-black uppercase flex items-center gap-2 animate-pulse">A Calcular...</span>}
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-3 bg-white/5 hover:bg-white/10 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-[2px] transition-all">Cancelar</button>
                        <button
                            onClick={saveSettings}
                            disabled={saving}
                            className={`px-12 py-3 rounded-lg text-[10px] font-black uppercase tracking-[2px] transition-all shadow-2xl ${hasChanges ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-950/40' : 'bg-[#222] text-gray-700 cursor-not-allowed'}`}
                        >
                            {saving ? 'A GRAVAR...' : 'GUARDAR NO DOCUMENTO'}
                        </button>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
                    .animate-slide-in-right { animation: slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #444; }
                `}} />
            </div>
        </div>,
        document.body
    );
}
