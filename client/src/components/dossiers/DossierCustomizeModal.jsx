import React, { useState, useEffect } from 'react';
import { IconX, IconPalette, IconShadow, IconResize, IconSettings, IconPhoto } from '@tabler/icons-react';
import api from '../../api/apiClient';
import AssetManager from '../system/AssetManager';

const COLORS = [
    { id: 'default', bg: 'bg-white dark:bg-slate-700', label: 'Padrão' },
    { id: 'blue', bg: 'bg-blue-50 dark:bg-blue-900/40', label: 'Azul' },
    { id: 'green', bg: 'bg-emerald-50 dark:bg-emerald-900/40', label: 'Verde' },
    { id: 'amber', bg: 'bg-amber-50 dark:bg-amber-900/40', label: 'Laranja' },
    { id: 'purple', bg: 'bg-purple-50 dark:bg-purple-900/40', label: 'Roxo' },
    { id: 'rose', bg: 'bg-rose-50 dark:bg-rose-900/40', label: 'Rosa' },
    { id: 'slate', bg: 'bg-slate-100 dark:bg-slate-800', label: 'Cinza' },
];

const SHADOWS = [
    { id: 'shadow-sm', label: 'Suave', class: 'shadow-sm' },
    { id: 'shadow-md', label: 'Média', class: 'shadow-md' },
    { id: 'shadow-xl', label: 'Forte', class: 'shadow-xl' },
    { id: 'none', label: 'Sem Sombra', class: 'shadow-none' },
];

const SIZES = [
    { id: 'normal', label: 'Normal (1x1)', class: 'col-span-1' },
    { id: 'wide', label: 'Largo (2x1)', class: 'col-span-1 md:col-span-2' },
];

export default function DossierCustomizeModal({ isOpen, onClose, node, onSuccess }) {
    const [activeTab, setActiveTab] = useState('style');
    const [style, setStyle] = useState({});
    const [iconId, setIconId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && node) {
            // Parse existing style or use defaults
            let currentStyle = {};
            try {
                if (typeof node.style === 'string') currentStyle = JSON.parse(node.style);
                else currentStyle = node.style || {};
            } catch (e) {
                currentStyle = {};
            }
            setStyle(currentStyle);
            setIconId(node.icon_asset_id || null);
        }
    }, [isOpen, node]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch(`/api/dossiers/nodes/${node.id}`, {
                style,
                icon_asset_id: iconId // Save to new column
            });
            onSuccess();
            onClose();
        } catch (e) {
            alert("Erro ao guardar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <h3 className="font-bold flex items-center gap-2">
                        <IconSettings size={18} /> Personalizar "{node.name}"
                    </h3>
                    <button onClick={onClose} className="hover:bg-[var(--surface-hover)] p-1 rounded"><IconX size={18} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)]">
                    <button
                        onClick={() => setActiveTab('style')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'style' ? 'border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    >
                        Estilo
                    </button>
                    <button
                        onClick={() => setActiveTab('icon')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'icon' ? 'border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    >
                        Ícone
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6" style={{ minHeight: '300px' }}>

                    {activeTab === 'style' && (
                        <>
                            {/* Colors */}
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-2"><IconPalette size={14} /> Cor de Fundo</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => setStyle({ ...style, bgColor: c.id === 'default' ? undefined : c.bg })}
                                            className={`h-10 rounded-lg border flex items-center justify-center transition-all ${c.bg} ${(style.bgColor === c.bg || (!style.bgColor && c.id === 'default')) ? 'ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--surface)]' : 'border-[var(--border)] opacity-70 hover:opacity-100'}`}
                                            title={c.label}
                                        >
                                            {/* Checkmark? */}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Shadow */}
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-2"><IconShadow size={14} /> Sombra</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {SHADOWS.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStyle({ ...style, shadow: s.class })}
                                            className={`px-3 py-2 rounded-lg border text-sm text-left transition-all
                                                ${(style.shadow === s.class)
                                                    ? 'bg-[var(--surface-active)] border-[var(--accent-primary)] text-[var(--text-main)]'
                                                    : 'border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]'}`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Size */}
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-2"><IconResize size={14} /> Tamanho</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {SIZES.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStyle({ ...style, colSpan: s.class })}
                                            className={`px-3 py-2 rounded-lg border text-sm text-left transition-all flex items-center justify-between
                                                ${(style.colSpan === s.class)
                                                    ? 'bg-[var(--surface-active)] border-[var(--accent-primary)] text-[var(--text-main)]'
                                                    : 'border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]'}`}
                                        >
                                            {s.label}
                                            <div className={`h-4 border border-current opacity-30 rounded ${s.id === 'wide' ? 'w-8' : 'w-4'}`}></div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'icon' && (
                        <div className="h-full flex flex-col">
                            {iconId && (
                                <div className="mb-4 p-3 bg-[var(--surface-hover)] rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded bg-white flex items-center justify-center p-1 border border-[var(--border)]">
                                            <img src={`/api/assets/${iconId}`} className="max-w-full max-h-full" alt="Icon" />
                                        </div>
                                        <span className="text-sm font-medium">Ícone Selecionado</span>
                                    </div>
                                    <button onClick={() => setIconId(null)} className="text-xs text-red-500 hover:underline">Remover</button>
                                </div>
                            )}
                            <div className="flex-1 min-h-[300px] border border-[var(--border)] rounded-xl overflow-hidden">
                                <AssetManager selectMode onSelect={(asset) => setIconId(asset.id)} />
                            </div>
                        </div>
                    )}

                </div>

                <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 text-sm bg-[var(--bg-base)]/50">
                    <button onClick={onClose} className="px-3 py-1.5 rounded hover:bg-[var(--surface-hover)]">Cancelar</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 bg-[var(--accent-primary)] text-white rounded shadow-sm hover:brightness-110 font-medium"
                    >
                        {saving ? 'Aplicando...' : 'Aplicar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
