import React, { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import api from '../../api/apiClient';
import { qp } from '../../shared/ui';

const ProposalEditor = ({ proposalId, onClose }) => {
    const [proposal, setProposal] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [searching, setSearching] = useState(false); // New
    const [activeSearchField, setActiveSearchField] = useState(null); // 'name' or 'vat'

    useEffect(() => {
        loadData();
    }, [proposalId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [pRes, projRes] = await Promise.all([
                api.get(`/api/proposals/${proposalId}`),
                api.get('/api/projects')
            ]);
            setProposal(pRes.data);
            setProjects(projRes.data.projects || []);
        } catch (e) {
            alert("Erro ao carregar dados: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/api/proposals/${proposalId}`, proposal);
            alert("Proposta guardada com sucesso!");
        } catch (e) {
            alert("Erro ao guardar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateHeader = (field, value) => {
        setProposal({ ...proposal, [field]: value });
    };

    const updateMetadata = (field, value) => {
        setProposal({
            ...proposal,
            metadata: { ...proposal.metadata, [field]: value }
        });
    };

    const updateLine = (index, field, value) => {
        const newLines = [...proposal.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setProposal({ ...proposal, lines: newLines });
    };

    const addLine = () => {
        const newLine = {
            id: 'new-' + Math.random().toString(36).substr(2, 9),
            sku: '',
            description: '',
            quantity: 1,
            unit_price_commercial: 0,
            discount_commercial_percent: 0,
            vat_rate: '23',
            extra_attributes: {}
        };
        setProposal({ ...proposal, lines: [...proposal.lines, newLine] });
    };

    const removeLine = (index) => {
        if (!confirm("Remover esta linha?")) return;
        const newLines = [...proposal.lines];
        newLines.splice(index, 1);
        setProposal({ ...proposal, lines: newLines });
    };

    const moveLine = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= proposal.lines.length) return;
        const newLines = [...proposal.lines];
        const temp = newLines[index];
        newLines[index] = newLines[newIndex];
        newLines[newIndex] = temp;
        setProposal({ ...proposal, lines: newLines });
    };

    const searchCRM = async (q) => {
        if (!q || q.length < 1) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        try {
            setSearching(true);
            setShowResults(true); // Show dropdown immediately to provide feedback
            const projectParam = proposal?.project_ref || 'default';

            // Cleaner params handling with Axios
            const res = await api.get('/api/crm/search', {
                params: {
                    project: projectParam,
                    q: q
                }
            });
            setSearchResults(res.data);
        } catch (e) {
            console.error("CRM Search Error:", e);
        } finally {
            setSearching(false);
        }
    };

    const selectCustomer = (c) => {
        setProposal({
            ...proposal,
            client_ref: c.name,
            metadata: {
                ...proposal.metadata,
                client_vat: c.vat,
                delivery_address: c.address,
                client_email: c.email,
                client_phone: c.phone
            }
        });
        setShowResults(false);
    };

    const saveToCrm = async () => {
        try {
            setSaving(true);
            const data = {
                name: proposal.client_ref,
                vat: proposal.metadata?.client_vat,
                address: proposal.metadata?.delivery_address,
                email: proposal.metadata?.client_email,
                phone: proposal.metadata?.client_phone
            };
            await api.post('/api/crm/upsert', data);
            alert("Dados do cliente atualizados no CRM com sucesso!");
        } catch (e) {
            alert("Erro ao atualizar CRM: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const calculateTotals = () => {
        if (!proposal?.lines) return { net: 0, vat: 0, gross: 0 };
        return proposal.lines.reduce((acc, l) => {
            const qty = parseFloat(l.quantity || 0);
            const price = parseFloat(l.unit_price_commercial || 0);
            const desc = parseFloat(l.discount_commercial_percent || 0);
            const lineNet = qty * price * (1 - desc / 100);
            const vat = lineNet * (parseFloat(l.vat_rate || 23) / 100);

            acc.net += lineNet;
            acc.vat += vat;
            acc.gross += (lineNet + vat);
            return acc;
        }, { net: 0, vat: 0, gross: 0 });
    };

    if (loading) return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center text-white z-[10000]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="font-bold tracking-widest animate-pulse">A CARREGAR EDITOR...</span>
            </div>
        </div>
    );

    const totals = calculateTotals();

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[10000] font-sans">
            <div className="w-full h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">

                {/* Header */}
                <div className="h-20 bg-white/5 border-b border-white/10 flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="w-12 h-12 bg-amber-500 rounded flex items-center justify-center text-black font-black text-xl shadow-lg shadow-amber-500/20">PS</div>
                        <div className="flex flex-col gap-1 flex-1 max-w-2xl">
                            <input
                                className="bg-transparent text-xl font-black text-white outline-none focus:text-amber-500 transition-colors w-full"
                                value={proposal.name}
                                onChange={e => updateHeader('name', e.target.value)}
                                placeholder="Nome da Proposta"
                            />
                            <div className="flex gap-4 items-center">
                                <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">{proposal.brand_id}</span>
                                <div className="h-3 w-px bg-white/10"></div>
                                <div className="flex gap-2 items-center">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-widest">Projeto/Ref:</span>
                                    <select
                                        className="bg-transparent text-[11px] text-gray-300 outline-none border-b border-transparent focus:border-amber-500"
                                        value={proposal.project_ref}
                                        onChange={e => updateHeader('project_ref', e.target.value)}
                                    >
                                        <option value={proposal.project_ref} className="bg-gray-900">{proposal.project_ref}</option>
                                        {projects.filter(p => p !== proposal.project_ref).map(p => (
                                            <option key={p} value={p} className="bg-gray-900">{p}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end mr-4">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Data Proposta</div>
                            <input
                                type="date"
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-amber-500"
                                value={proposal.metadata?.doc_date ? new Date(proposal.metadata.doc_date).toISOString().split('T')[0] : ''}
                                onChange={e => updateMetadata('doc_date', e.target.value)}
                            />
                        </div>
                        <div className="w-px h-10 bg-white/10 mx-2"></div>
                        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-xs font-bold border border-white/10">
                            📄 PDF
                        </button>
                        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-xs font-bold border border-white/10">
                            📊 Excel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-all text-xs font-black uppercase tracking-tight shadow-lg shadow-amber-500/20 disabled:opacity-50"
                        >
                            {saving ? 'A Guardar...' : 'Guardar'}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center hover:bg-red-500/20 text-white rounded-full transition-all text-xl"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Sub-Header: Client & Address */}
                <div className="bg-white/[0.02] border-b border-white/10 p-8 flex gap-8 shrink-0 flex-wrap relative">
                    <div className="flex-[1.5] flex flex-col gap-4">
                        <div className="relative">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] text-gray-500 uppercase tracking-widest block font-bold italic">Entidade Comercial</label>
                                <button
                                    onClick={saveToCrm}
                                    className="text-[8px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 transition-all font-bold uppercase"
                                    title="Guardar estes dados permanentemente no CRM"
                                >
                                    Sincronizar CRM
                                </button>
                            </div>
                            <div className="relative group/search">
                                <input
                                    className="w-full bg-transparent text-lg font-black text-amber-500 outline-none border-b border-white/5 focus:border-amber-500 transition-all pl-8"
                                    value={proposal.client_ref}
                                    onChange={e => {
                                        updateHeader('client_ref', e.target.value);
                                        searchCRM(e.target.value);
                                    }}
                                    onBlur={() => setTimeout(() => setShowResults(false), 300)} // Increased timeout
                                    onFocus={() => {
                                        setActiveSearchField('name');
                                        if (proposal.client_ref?.length >= 1) setShowResults(true);
                                    }}
                                    placeholder="Pesquise por Nome do Cliente..."
                                />
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setActiveSearchField('name'); // Ensure field is active for dropdown positioning
                                        searchCRM(proposal.client_ref);
                                    }}
                                    className="absolute left-0 bottom-2 text-amber-500/30 hover:text-amber-500 transition-colors z-10"
                                    title="Pesquisar agora"
                                >
                                    {searching ? (
                                        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    )}
                                </button>
                            </div>

                            {/* CRM Search Results Dropdown */}
                            {showResults && activeSearchField === 'name' && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 max-h-64 overflow-auto backdrop-blur-xl">
                                    {searching ? (
                                        <div className="p-4 text-[10px] text-amber-500 italic text-center animate-pulse">A pesquisar clientes...</div>
                                    ) : searchResults.length === 0 ? (
                                        <div className="p-4 text-[10px] text-gray-500 italic text-center">Nenhum cliente encontrado...</div>
                                    ) : (
                                        searchResults.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                className="p-4 hover:bg-amber-500/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors group"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-bold text-white group-hover:text-amber-500">{c.name}</span>
                                                    <span className="text-[10px] font-mono text-gray-500">{c.vat}</span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1 truncate">{c.address}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 relative">
                                <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">NIF / VAT</label>
                                <input
                                    className="w-full bg-white/5 px-3 py-2 rounded text-xs text-gray-300 outline-none border border-white/5 focus:border-amber-500/50"
                                    value={proposal.metadata?.client_vat || ''}
                                    onChange={e => {
                                        updateMetadata('client_vat', e.target.value);
                                        searchCRM(e.target.value);
                                    }}
                                    onBlur={() => setTimeout(() => setShowResults(false), 300)}
                                    onFocus={() => {
                                        setActiveSearchField('vat');
                                        if (proposal.metadata?.client_vat?.length >= 1) setShowResults(true);
                                    }}
                                />

                                {/* CRM Search Results Dropdown for NIF */}
                                {showResults && activeSearchField === 'vat' && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 max-h-64 overflow-auto backdrop-blur-xl">
                                        {searching ? (
                                            <div className="p-4 text-[10px] text-amber-500 italic text-center animate-pulse">A pesquisar clientes por NIF...</div>
                                        ) : searchResults.length === 0 ? (
                                            <div className="p-4 text-[10px] text-gray-500 italic text-center">Nenhum NIF encontrado...</div>
                                        ) : (
                                            searchResults.map(c => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => selectCustomer(c)}
                                                    className="p-4 hover:bg-amber-500/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors group"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-bold text-white group-hover:text-amber-500">{c.name}</span>
                                                        <span className="text-[10px] font-mono text-gray-500">{c.vat}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-1 truncate">{c.address}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Contacto / Email</label>
                                <input
                                    className="w-full bg-white/5 px-3 py-2 rounded text-xs text-gray-300 outline-none border border-white/5 focus:border-amber-500/50"
                                    value={proposal.metadata?.client_email || ''}
                                    onChange={e => updateMetadata('client_email', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-[2]">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Morada de Entrega / Notas Fiscais</label>
                        <textarea
                            rows="4"
                            className="w-full bg-white/5 px-4 py-3 rounded text-sm text-gray-400 outline-none border border-white/5 focus:border-amber-500/50 resize-none h-full"
                            value={proposal.metadata?.delivery_address || ''}
                            onChange={e => updateMetadata('delivery_address', e.target.value)}
                            placeholder="Introduza a morada completa para faturação e entrega..."
                        />
                    </div>

                    <div className="w-64 flex flex-col gap-4">
                        <div>
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Nossa Ref / Orç.</label>
                            <input
                                className="w-full bg-white/5 px-3 py-2 rounded font-mono text-xs text-amber-500/80 outline-none border border-white/5 focus:border-amber-500/50"
                                value={proposal.metadata?.our_ref || ''}
                                onChange={e => updateMetadata('our_ref', e.target.value)}
                            />
                        </div>
                        <div className="flex-1 bg-amber-500/5 border border-amber-500/20 rounded p-4 flex flex-col justify-center">
                            <span className="text-[8px] text-amber-500/50 uppercase font-bold text-center block mb-2">Resumo da Proposta</span>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-gray-500">Linhas</span>
                                <span className="text-white font-bold">{proposal.lines?.length || 0}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-gray-500">Total Bruto</span>
                                <span className="text-white font-bold">{calculateTotals().gross.toFixed(2)} €</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-auto p-8">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                                <th className="pb-4 font-normal w-12 text-center">#</th>
                                <th className="pb-4 font-normal w-24">SKU</th>
                                <th className="pb-4 font-normal">Descrição Comercial</th>
                                <th className="pb-4 font-normal w-20 text-center">Qtd</th>
                                <th className="pb-4 font-normal w-32 text-right">Preço Un. (€)</th>
                                <th className="pb-4 font-normal w-24 text-center">Desc (%)</th>
                                <th className="pb-4 font-normal w-32 text-right">Total (€)</th>
                                <th className="pb-4 font-normal w-32 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {proposal.lines.map((line, idx) => {
                                const qty = parseFloat(line.quantity || 0);
                                const price = parseFloat(line.unit_price_commercial || 0);
                                const desc = parseFloat(line.discount_commercial_percent || 0);
                                const lineTotal = qty * price * (1 - desc / 100);

                                return (
                                    <tr key={line.id} className="group hover:bg-white/[0.02]">
                                        <td className="py-3 text-[9px] font-mono text-gray-600 text-center">{idx + 1}</td>
                                        <td className="py-3 text-[11px] font-mono text-amber-500/70">
                                            <input
                                                className="bg-transparent outline-none w-full focus:text-white"
                                                value={line.sku}
                                                onChange={e => updateLine(idx, 'sku', e.target.value)}
                                                placeholder="SKU..."
                                            />
                                        </td>
                                        <td className="py-3 pr-4">
                                            <textarea
                                                rows="1"
                                                className="w-full bg-transparent text-gray-300 outline-none resize-none focus:text-white"
                                                value={line.description}
                                                onChange={e => updateLine(idx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <input
                                                className="w-full bg-transparent text-center outline-none text-gray-400 focus:text-white"
                                                type="number"
                                                value={line.quantity}
                                                onChange={e => updateLine(idx, 'quantity', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <input
                                                className="w-full bg-transparent text-right outline-none text-gray-400 focus:text-white font-mono"
                                                type="number"
                                                step="0.01"
                                                value={line.unit_price_commercial}
                                                onChange={e => updateLine(idx, 'unit_price_commercial', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <input
                                                className="w-full bg-transparent text-center outline-none text-gray-400 focus:text-white"
                                                type="number"
                                                value={line.discount_commercial_percent}
                                                onChange={e => updateLine(idx, 'discount_commercial_percent', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3 text-right font-mono text-white font-bold">
                                            {lineTotal.toFixed(2)} €
                                        </td>
                                        <td className="py-3">
                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => moveLine(idx, -1)}
                                                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                                    title="Mover para cima"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    onClick={() => moveLine(idx, 1)}
                                                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                                    title="Mover para baixo"
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    onClick={() => removeLine(idx)}
                                                    className="w-8 h-8 flex items-center justify-center hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500"
                                                    title="Remover linha"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <button
                        onClick={addLine}
                        className="mt-6 w-full py-4 border-2 border-dashed border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 text-gray-500 hover:text-amber-500 transition-all rounded-xl font-bold flex items-center justify-center gap-2 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">+</span>
                        Adicionar Novo Artigo / Linha
                    </button>
                </div>

                {/* Footer Totals */}
                <div className="h-24 bg-white/5 border-t border-white/10 flex items-center justify-end px-12 gap-12">
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase">Subtotal</div>
                        <div className="text-xl text-gray-300 font-mono">{totals.net.toFixed(2)} €</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase">IVA (23%)</div>
                        <div className="text-xl text-gray-300 font-mono">{totals.vat.toFixed(2)} €</div>
                    </div>
                    <div className="text-right bg-amber-500/10 px-6 py-2 rounded-xl border border-amber-500/20">
                        <div className="text-[10px] text-amber-500 font-bold uppercase">Total Final</div>
                        <div className="text-3xl text-white font-black font-mono">{totals.gross.toFixed(2)} €</div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ProposalEditor;
