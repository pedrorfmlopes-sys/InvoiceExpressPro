import React, { useState, useEffect } from 'react';
import { IconArrowUp, IconArrowDown, IconDeviceFloppy } from '@tabler/icons-react';
import api from '../api/apiClient';
import { qp } from '../shared/ui';

export default function UIConfigPanel({ project }) {
    const [config, setConfig] = useState({ sidebar: { order: [], labels: {} } });
    const [loading, setLoading] = useState(false);
    const [availableTabs] = useState([
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'corev2', label: 'Ficheiros' },
        { id: 'processv2', label: 'Processar' },
        { id: 'projects', label: 'Projetos' },
        { id: 'reports', label: 'Relatórios' },
        // Add others if hardcoded in App.jsx
    ]);

    useEffect(() => {
        loadConfig();
    }, [project]);

    async function loadConfig() {
        try {
            setLoading(true);
            const res = await api.get(qp('/api/config/ui', project));
            // Ensure structure
            const data = res.data || {};
            if (!data.sidebar) data.sidebar = { order: [], labels: {} };
            setConfig(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function saveConfig() {
        try {
            setLoading(true);
            await api.post(qp('/api/config/ui', project), config);
            alert('Configuração UI guardada. Recarrega a página para aplicar.');
        } catch (e) {
            alert('Erro ao guardar: ' + e.message);
        } finally {
            setLoading(false);
        }
    }

    // Sort tabs based on config order
    const sortedTabs = [...availableTabs].sort((a, b) => {
        const order = config.sidebar.order || [];
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const move = (index, direction) => {
        const newTabs = [...sortedTabs];
        if (direction === -1 && index > 0) {
            [newTabs[index], newTabs[index - 1]] = [newTabs[index - 1], newTabs[index]];
        } else if (direction === 1 && index < newTabs.length - 1) {
            [newTabs[index], newTabs[index + 1]] = [newTabs[index + 1], newTabs[index]];
        }
        // Update order array
        const newOrder = newTabs.map(t => t.id);
        setConfig({ ...config, sidebar: { ...config.sidebar, order: newOrder } });
    };

    const handleLabelChange = (id, val) => {
        setConfig({
            ...config,
            sidebar: {
                ...config.sidebar,
                labels: { ...config.sidebar.labels, [id]: val }
            }
        });
    };

    return (
        <div className="glass-panel">
            <div className="flex items-center gap-2 mb-6">
                <span className="text-xl">🎨</span>
                <h3 className="font-bold text-lg">Personalização UI</h3>
            </div>

            <div className="flex flex-col gap-2">
                <div className="text-sm font-medium text-[var(--text-muted)] mb-2 flex justify-between pr-4">
                    <span>Menu Workspace</span>
                    <span>Renomear</span>
                </div>
                {sortedTabs.map((tab, idx) => (
                    <div key={tab.id} className="flex items-center gap-2 p-2 bg-[var(--bg-base)] rounded border border-[var(--border)]">
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                className="p-1 hover:bg-[var(--surface-hover)] rounded disabled:opacity-30"
                            >
                                <IconArrowUp size={14} />
                            </button>
                            <button
                                onClick={() => move(idx, 1)}
                                disabled={idx === sortedTabs.length - 1}
                                className="p-1 hover:bg-[var(--surface-hover)] rounded disabled:opacity-30"
                            >
                                <IconArrowDown size={14} />
                            </button>
                        </div>
                        <div className="flex-1 font-medium text-sm ml-2">
                            {tab.label} <span className="text-[10px] text-[var(--text-muted)]">({tab.id})</span>
                        </div>
                        <input
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-sm w-40"
                            placeholder={tab.label}
                            value={config.sidebar.labels?.[tab.id] || ''}
                            onChange={e => handleLabelChange(tab.id, e.target.value)}
                        />
                    </div>
                ))}

                <button
                    onClick={saveConfig}
                    disabled={loading}
                    className="btn primary self-start mt-4 flex items-center gap-2"
                >
                    <IconDeviceFloppy size={18} />
                    Guardar Alterações
                </button>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                    Nota: Recarrega a página após guardar.
                </div>
            </div>

            <div className="flex flex-col gap-2 mt-6 pt-6 border-t border-[var(--border)]">
                <div className="text-sm font-medium text-[var(--text-muted)] mb-2">
                    Menu Cartões (Projetos)
                </div>
                {[
                    { id: 'edit', label: 'Editar' },
                    { id: 'labels', label: 'Etiquetas' },
                    { id: 'customize', label: 'Personalizar' },
                    { id: 'linkDoc', label: 'Associar Doc' },
                    { id: 'delete', label: 'Apagar' }
                ].map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-[var(--bg-base)] rounded border border-[var(--border)]">
                        <span className="text-sm">{item.label}</span>
                        <input
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-sm w-40"
                            placeholder={item.label}
                            value={config.card?.labels?.[item.id] || ''}
                            onChange={e => setConfig({
                                ...config,
                                card: {
                                    ...config.card,
                                    labels: { ...config.card?.labels, [item.id]: e.target.value }
                                }
                            })}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
