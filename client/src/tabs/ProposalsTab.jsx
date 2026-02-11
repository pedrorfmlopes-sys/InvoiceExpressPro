import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '../components/ui/GlassCard';
import api from '../api/apiClient';
import { qp } from '../shared/ui';
import ProposalEditor from '../components/proposals/ProposalEditor';

export default function ProposalsTab({ project, setEditingProposalId }) {
    const { t } = useTranslation();
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProposals();
    }, [project]);

    const loadProposals = async () => {
        try {
            setLoading(true);
            const res = await api.get(qp('/api/proposals', project));
            setProposals(res.data || []);
        } catch (e) {
            console.error("Failed to load proposals:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Tem a certeza que deseja apagar esta proposta definitivamente?")) return;
        try {
            await api.delete(`/api/proposals/${id}`);
            setProposals(proposals.filter(p => p.id !== id));
        } catch (e) {
            alert("Erro ao apagar: " + e.message);
        }
    };

    if (loading) return <div className="p-10 animate-pulse">A carregar propostas...</div>;

    return (
        <div className="p-8 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-[var(--text-main)]">Estúdio de Propostas</h1>
                    <p className="text-sm text-[var(--text-muted)]">Crie e gira propostas comerciais personalizadas para todas as suas marcas.</p>
                </div>
            </div>

            <GlassCard className="overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[var(--bg-base)]/50 text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--sidebar-border)]">
                            <th className="px-6 py-4 font-bold">Designação da Proposta</th>
                            <th className="px-6 py-4 font-bold">Marca</th>
                            <th className="px-6 py-4 font-bold">Cliente</th>
                            <th className="px-6 py-4 font-bold text-center">Data</th>
                            <th className="px-6 py-4 font-bold text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sidebar-border)]">
                        {proposals.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-[var(--text-muted)] opacity-50 italic">
                                    Nenhuma proposta encontrada neste projeto.
                                </td>
                            </tr>
                        ) : (
                            proposals.map(p => (
                                <tr key={p.id} className="group hover:bg-[var(--surface-hover)] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-[var(--text-main)]">{p.name}</div>
                                        <div className="text-[10px] text-[var(--text-muted)] font-mono">{p.id.split('-')[0]}...</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase">
                                            {p.brand_id}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-[var(--text-main)]">{p.client_ref || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-xs text-[var(--text-muted)]">
                                            {new Date(p.created_at).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={() => setEditingProposalId(p.id)}
                                                className="btn-icon text-amber-500 hover:scale-110"
                                                title="Editar"
                                            >
                                                📝
                                            </button>
                                            <button
                                                onClick={() => handleDelete(p.id)}
                                                className="btn-icon text-red-500 hover:scale-110"
                                                title="Eliminar"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </GlassCard>
        </div>
    );
}
