import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/apiClient';
import { GlassCard } from '../ui/GlassCard';
import { FiRefreshCw, FiShuffle, FiX } from 'react-icons/fi';

function toFiniteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
    const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSyncText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function normalizeSyncSku(value) {
    return normalizeSyncText(value).replace(/\s+/g, '');
}

function getFieldDiffs(proposalLine, sourceLine) {
    if (!proposalLine || !sourceLine) {
        return { sku: false, description: false, quantity: false, price: false };
    }
    const proposalDescription = proposalLine.originalDescription || proposalLine.description;
    return {
        sku: normalizeSyncSku(proposalLine.sku) !== normalizeSyncSku(sourceLine.sku),
        description: normalizeSyncText(proposalDescription) !== normalizeSyncText(sourceLine.description),
        quantity: Math.abs(toFiniteNumber(proposalLine.quantity, 0) - toFiniteNumber(sourceLine.quantity, 0)) > 0.0001,
        price: Math.abs(toFiniteNumber(proposalLine.unitPrice, 0) - toFiniteNumber(sourceLine.unitPrice, 0)) > 0.01
    };
}

function SourceLineOptionLabel({ line }) {
    return (
        `${line.sourceIndex + 1}. ${line.sku || 'SEM SKU'} | ${line.description || 'Sem descricao'} | Qtd ${toFiniteNumber(line.quantity, 0)} | ${toFiniteNumber(line.unitPrice, 0).toFixed(2)}€`
    );
}

export default function ProposalSourceSyncModal({ proposalId, onClose, onApplied, onPrepareSync }) {
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [preview, setPreview] = useState(null);
    const [selectedSourceDocId, setSelectedSourceDocId] = useState('');
    const [rowState, setRowState] = useState({});

    const loadPreview = async (docId = null) => {
        try {
            setLoading(true);
            const res = await api.get(`/api/proposals/${proposalId}/source-sync/preview`, {
                params: docId ? { sourceDocId: docId } : {}
            });
            const data = res.data;
            setPreview(data);
            setSelectedSourceDocId(data.sourceDocId || '');

            const nextState = {};
            (data.matches || []).forEach(match => {
                nextState[match.proposalLineId] = {
                    enabled: !!(match.suggestedSourceIndex !== null && match.hasChanges),
                    sourceIndex: match.suggestedSourceIndex ?? '',
                    fields: {
                        sku: !!match.fieldDiffs?.sku,
                        description: !!match.fieldDiffs?.description,
                        quantity: !!match.fieldDiffs?.quantity,
                        price: !!match.fieldDiffs?.price
                    }
                };
            });
            setRowState(nextState);
        } catch (e) {
            alert('Erro ao preparar atualização da proposta: ' + (e.response?.data?.error || e.message));
            onClose?.();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPreview();
    }, [proposalId]);

    const sourceLinesByIndex = useMemo(() => {
        const map = {};
        (preview?.sourceLines || []).forEach(line => {
            map[String(line.sourceIndex)] = line;
        });
        return map;
    }, [preview]);

    const matches = preview?.matches || [];

    const selectedCount = matches.reduce((acc, match) => (
        rowState[match.proposalLineId]?.enabled ? acc + 1 : acc
    ), 0);
    const hasAnyMatch = matches.length > 0;
    const areAllSelected = hasAnyMatch && matches.every(match => rowState[match.proposalLineId]?.enabled);

    const handleSourceDocChange = async (docId) => {
        setSelectedSourceDocId(docId);
        await loadPreview(docId);
    };

    const updateRowSelection = (proposalLineId, patch) => {
        setRowState(prev => ({
            ...prev,
            [proposalLineId]: {
                ...(prev[proposalLineId] || {}),
                ...patch
            }
        }));
    };

    const updateRowSource = (match, nextSourceIndex) => {
        const sourceLine = sourceLinesByIndex[String(nextSourceIndex)];
        const fieldDiffs = getFieldDiffs(match.proposalLine, sourceLine);
        setRowState(prev => ({
            ...prev,
            [match.proposalLineId]: {
                enabled: !!sourceLine && Object.values(fieldDiffs).some(Boolean),
                sourceIndex: nextSourceIndex,
                fields: {
                    sku: !!fieldDiffs.sku,
                    description: !!fieldDiffs.description,
                    quantity: !!fieldDiffs.quantity,
                    price: !!fieldDiffs.price
                }
            }
        }));
    };

    const toggleField = (proposalLineId, field) => {
        setRowState(prev => ({
            ...prev,
            [proposalLineId]: {
                ...(prev[proposalLineId] || {}),
                fields: {
                    ...(prev[proposalLineId]?.fields || {}),
                    [field]: !prev[proposalLineId]?.fields?.[field]
                }
            }
        }));
    };

    const setAllRowsEnabled = (enabled) => {
        const nextState = {};
        matches.forEach(match => {
            const current = rowState[match.proposalLineId] || {
                enabled: false,
                sourceIndex: match.suggestedSourceIndex ?? '',
                fields: {
                    sku: !!match.fieldDiffs?.sku,
                    description: !!match.fieldDiffs?.description,
                    quantity: !!match.fieldDiffs?.quantity,
                    price: !!match.fieldDiffs?.price
                }
            };

            const hasSelectableSource = current.sourceIndex !== '' && current.sourceIndex !== null && current.sourceIndex !== undefined;
            const hasAnyField = Object.values(current.fields || {}).some(Boolean);

            nextState[match.proposalLineId] = {
                ...current,
                enabled: enabled && hasSelectableSource && hasAnyField
            };
        });
        setRowState(nextState);
    };

    const handleApply = async () => {
        const updates = matches
            .map(match => {
                const config = rowState[match.proposalLineId];
                if (!config?.enabled || config.sourceIndex === '' || config.sourceIndex === null || config.sourceIndex === undefined) return null;

                const hasAnyField = Object.values(config.fields || {}).some(Boolean);
                if (!hasAnyField) return null;

                return {
                    proposalLineId: match.proposalLineId,
                    sourceIndex: Number(config.sourceIndex),
                    fields: config.fields
                };
            })
            .filter(Boolean);

        if (updates.length === 0) {
            alert('Seleciona pelo menos uma linha com alterações para aplicar.');
            return;
        }

        try {
            setApplying(true);
            if (onPrepareSync) {
                await onPrepareSync();
            }
            const res = await api.post(`/api/proposals/${proposalId}/source-sync/apply`, {
                sourceDocId: selectedSourceDocId,
                updates
            });
            alert(`${res.data?.appliedCount || updates.length} linha(s) atualizada(s) com sucesso.`);
            onApplied?.(res.data?.proposal);
            onClose?.();
        } catch (e) {
            alert('Erro ao aplicar atualização: ' + (e.response?.data?.error || e.message));
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <GlassCard className="relative z-10 w-full max-w-7xl max-h-[88vh] overflow-hidden border-sky-500/20">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-sky-500/5">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <FiShuffle className="text-sky-300" />
                            Atualizar Proposta por Proforma
                        </h2>
                        <p className="text-xs text-sky-200/70 mt-1">
                            Escolhe a proforma retificada e aplica só as linhas/campos que queres atualizar.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center"
                    >
                        <FiX />
                    </button>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-sky-200 animate-pulse font-bold">A preparar comparação...</div>
                ) : (
                    <>
                        <div className="px-6 py-4 border-b border-white/10 bg-black/20 flex flex-wrap items-end gap-4">
                            <div className="min-w-[320px]">
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black block mb-2">
                                    Documento-fonte para atualização
                                </label>
                                <select
                                    value={selectedSourceDocId}
                                    onChange={e => handleSourceDocChange(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                                >
                                    {(preview?.candidates || []).map(doc => (
                                        <option key={doc.id} value={doc.id}>
                                            {doc.docNumber} | {doc.docType || 'documento'}{doc.isOriginal ? ' | original' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                <div className="text-[9px] uppercase tracking-widest text-gray-500 font-black">Linhas da proposta</div>
                                <div className="text-xl font-black text-white">{matches.length}</div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                <div className="text-[9px] uppercase tracking-widest text-gray-500 font-black">Linhas selecionadas</div>
                                <div className="text-xl font-black text-sky-300">{selectedCount}</div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                <div className="text-[9px] uppercase tracking-widest text-gray-500 font-black">Fonte atual</div>
                                <div className="text-sm font-bold text-white">
                                    {preview?.sourceDocument?.docNumber || 'Sem documento'}
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={() => setAllRowsEnabled(true)}
                                    className="px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-200 text-[11px] font-bold"
                                >
                                    Selecionar tudo
                                </button>
                                <button
                                    onClick={() => setAllRowsEnabled(false)}
                                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold"
                                >
                                    Limpar tudo
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[56vh] overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-[#0d1117] z-10">
                                    <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                                        <th className="px-4 py-3 w-16 text-center">
                                            <input
                                                type="checkbox"
                                                checked={areAllSelected}
                                                onChange={e => setAllRowsEnabled(e.target.checked)}
                                                className="accent-sky-400 w-4 h-4"
                                            />
                                        </th>
                                        <th className="px-4 py-3 w-[28%]">Linha Atual</th>
                                        <th className="px-4 py-3 w-[30%]">Linha da Proforma</th>
                                        <th className="px-4 py-3">Campos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {matches.map(match => {
                                        const config = rowState[match.proposalLineId] || {
                                            enabled: false,
                                            sourceIndex: '',
                                            fields: { sku: false, description: false, quantity: false, price: false }
                                        };
                                        const selectedSourceLine = sourceLinesByIndex[String(config.sourceIndex)];
                                        const fieldDiffs = getFieldDiffs(match.proposalLine, selectedSourceLine);

                                        return (
                                            <tr key={match.proposalLineId} className="align-top hover:bg-white/[0.02]">
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!config.enabled}
                                                        onChange={e => updateRowSelection(match.proposalLineId, { enabled: e.target.checked })}
                                                        className="accent-sky-400 w-4 h-4"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-[10px] text-gray-500 font-mono mb-1">#{match.proposalIndex + 1}</div>
                                                    <div className="text-xs font-black text-amber-400">{match.proposalLine.sku || 'SEM SKU'}</div>
                                                    <div className="text-sm text-white leading-snug mt-1 whitespace-pre-wrap">{match.proposalLine.description || 'Sem descrição'}</div>
                                                    {match.proposalLine.originalDescription && match.proposalLine.originalDescription !== match.proposalLine.description && (
                                                        <div className="mt-2 text-[11px] text-sky-200/70 italic whitespace-pre-wrap">
                                                            Original: {match.proposalLine.originalDescription}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 text-[11px] text-gray-400 font-mono">
                                                        Qtd {toFiniteNumber(match.proposalLine.quantity, 0)} | {toFiniteNumber(match.proposalLine.unitPrice, 0).toFixed(2)}€
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        value={config.sourceIndex}
                                                        onChange={e => updateRowSource(match, e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-sky-400"
                                                    >
                                                        <option value="">Sem atualização</option>
                                                        {(preview?.sourceLines || []).map(line => (
                                                            <option key={line.sourceIndex} value={line.sourceIndex}>
                                                                {SourceLineOptionLabel({ line })}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {selectedSourceLine ? (
                                                        <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                                            <div className="text-xs font-black text-sky-200">{selectedSourceLine.sku || 'SEM SKU'}</div>
                                                            <div className="text-sm text-white leading-snug mt-1 whitespace-pre-wrap">{selectedSourceLine.description || 'Sem descrição'}</div>
                                                            <div className="mt-2 text-[11px] text-sky-100/70 font-mono">
                                                                Qtd {toFiniteNumber(selectedSourceLine.quantity, 0)} | {toFiniteNumber(selectedSourceLine.unitPrice, 0).toFixed(2)}€
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-3 text-[11px] text-gray-500 italic">Sem linha de origem selecionada.</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            ['sku', 'SKU'],
                                                            ['description', 'Descrição'],
                                                            ['quantity', 'Quantidade'],
                                                            ['price', 'Preço']
                                                        ].map(([field, label]) => (
                                                            <label
                                                                key={field}
                                                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                                                                    fieldDiffs[field]
                                                                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-100'
                                                                        : 'border-white/10 bg-white/5 text-gray-500'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!config.fields?.[field]}
                                                                    onChange={() => toggleField(match.proposalLineId, field)}
                                                                    disabled={!selectedSourceLine}
                                                                    className="accent-sky-400"
                                                                />
                                                                <span className="font-bold">{label}</span>
                                                                {!fieldDiffs[field] && <span className="ml-auto text-[9px] uppercase">igual</span>}
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {match.suggestedScore > 0 && (
                                                        <div className="mt-3 text-[10px] uppercase tracking-widest text-sky-300/70 font-black">
                                                            Match sugerido: {match.suggestedScore} pontos
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex items-center justify-between">
                            <div className="text-xs text-gray-400">
                                Esta atualização preserva comentários, ordem das restantes linhas e trabalho manual fora dos campos escolhidos.
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => loadPreview(selectedSourceDocId || null)}
                                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-2"
                                >
                                    <FiRefreshCw />
                                    Atualizar comparação
                                </button>
                                <button
                                    onClick={handleApply}
                                    disabled={applying || selectedCount === 0}
                                    className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black text-xs font-black uppercase tracking-tight"
                                >
                                    {applying ? 'A aplicar...' : 'Aplicar atualizações'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </GlassCard>
        </div>
    );
}
