import React, { useState } from 'react';
import { IconHome, IconChevronRight, IconPlus, IconFolderPlus, IconFolder, IconX } from '@tabler/icons-react';
import DossierCard from './DossierCard';
import DossierDocCard from './DossierDocCard';
import api from '../../api/apiClient';
import DossierLabelModal from './DossierLabelModal';
import DossierCustomizeModal from './DossierCustomizeModal';
import DossierLinkDocModal from './DossierLinkDocModal';

export default function DossierBrowser({
    loading,
    nodes,
    docs = [],
    breadcrumbs,
    currentParent,
    onNavigate,
    onRefresh,
    onViewDoc,
    onUnlinkDoc
}) {
    // Local state for modals (Create/Edit)
    const [isCreating, setIsCreating] = useState(false);
    const [editingNode, setEditingNode] = useState(null); // If set, we are editing this node
    const [labelingNode, setLabelingNode] = useState(null); // For Labels Modal
    const [customizingNode, setCustomizingNode] = useState(null); // For Customize Modal
    const [linkingNode, setLinkingNode] = useState(null); // For Link Doc Modal
    const [nodeName, setNodeName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // UI Config
    const [uiConfig, setUiConfig] = useState({});
    React.useEffect(() => {
        api.get('/api/config/ui').then(r => setUiConfig(r.data || {})).catch(e => console.error("UI Config error", e));
    }, []);

    const openCreate = () => {
        setNodeName('');
        setEditingNode(null);
        setIsCreating(true);
    };

    const handleEdit = (node) => {
        setNodeName(node.name);
        setEditingNode(node);
        setIsCreating(true); // Reuse modal
    };

    const handleAssignLabels = (node) => {
        setLabelingNode(node);
    };

    const handleCustomize = (node) => {
        setCustomizingNode(node);
    };

    const handleLinkDoc = (node) => {
        setLinkingNode(node);
    };

    const handleDelete = async (node) => {
        if (!confirm(`Tem a certeza que deseja apagar (arquivar) "${node.name}"?`)) return;
        try {
            await api.patch(`/api/dossiers/nodes/${node.id}`, { archived: true });
            onRefresh();
        } catch (e) {
            console.error(e);
            alert("Erro ao apagar: " + e.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nodeName.trim()) return;
        setSubmitting(true);
        try {
            if (editingNode) {
                // Update
                await api.patch(`/api/dossiers/nodes/${editingNode.id}`, { name: nodeName });
            } else {
                // Create
                await api.post('/api/dossiers/nodes', {
                    name: nodeName,
                    parentId: currentParent
                });
            }
            setNodeName('');
            setEditingNode(null);
            setIsCreating(false);
            onRefresh();
        } catch (error) {
            console.error(error);
            alert("Erro: " + (error.response?.data?.error || error.message));
        } finally {
            setSubmitting(false);
        }
    };

    const handleMoveNode = async (sourceId, targetId) => {
        if (!sourceId || !targetId || sourceId === targetId) return;
        try {
            await api.post(`/api/dossiers/nodes/${sourceId}/move`, { parentId: targetId });
            onRefresh(); // Refresh grid
        } catch (e) {
            console.error("Move failed", e);
            alert("Erro ao mover: " + (e.response?.data?.error || e.message));
        }
    };

    const handleQuickUpdate = async (node, updates) => {
        try {
            await api.patch(`/api/dossiers/nodes/${node.id}`, updates);
            onRefresh();
        } catch (e) {
            console.error("Update failed", e);
            alert("Update error: " + e.message);
        }
    };

    const isEmpty = nodes.length === 0 && docs.length === 0;

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Toolbar */}
            <div className="h-12 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-4 justify-between shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 overflow-hidden text-sm text-[var(--text-muted)]">
                    <button
                        onClick={() => onNavigate(null)}
                        className={`p-1.5 rounded hover:bg-[var(--surface-hover)] ${!currentParent ? 'text-[var(--accent-primary)] font-semibold bg-[var(--surface-active)]' : ''}`}
                    >
                        <IconHome size={18} />
                    </button>

                    {breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={crumb.id}>
                            <IconChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
                            <button
                                onClick={() => onNavigate(crumb.id)}
                                className={`truncate max-w-[150px] hover:text-[var(--accent-primary)] hover:underline px-1 py-0.5 rounded ${i === breadcrumbs.length - 1 ? 'font-semibold text-[var(--text-main)]' : ''}`}
                            >
                                {crumb.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-[var(--accent-primary)] text-white px-3 py-1.5 rounded-md hover:brightness-110 text-sm font-medium transition-all shadow-sm"
                    >
                        {currentParent ? <IconFolderPlus size={18} /> : <IconPlus size={18} />}
                        {currentParent ? "Novo Subprojeto" : "Novo Projeto"}
                    </button>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-transparent custom-scrollbar">
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl animate-pulse" />)}
                    </div>
                ) : isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-50">
                        <IconFolder size={64} stroke={1} />
                        <p className="mt-2 text-sm font-medium">Pasta vazia</p>
                        <p className="text-xs mt-1 cursor-pointer hover:underline" onClick={openCreate}>Clique em "Novo" para começar.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* Folders */}
                        {nodes.map(node => (
                            <DossierCard
                                key={node.id}
                                node={node}
                                onClick={() => onNavigate(node.id)}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onMove={handleMoveNode}
                                onAssignLabels={handleAssignLabels}
                                onCustomize={handleCustomize}
                                onLinkDoc={handleLinkDoc}
                                onQuickUpdate={handleQuickUpdate}
                                uiConfig={uiConfig}
                            />
                        ))}

                        {/* Documents */}
                        {docs.map(doc => (
                            <DossierDocCard
                                key={doc.id}
                                doc={doc}
                                onView={onViewDoc}
                                onUnlink={onUnlinkDoc}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-[var(--text-main)]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-hover)]/30">
                            <h3 className="font-bold text-lg">{editingNode ? 'Editar Projeto' : (currentParent ? 'Novo Subprojeto' : 'Novo Projeto')}</h3>
                            <button onClick={() => setIsCreating(false)} className="text-[var(--text-muted)] hover:text-red-500"><IconX size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nome</label>
                                <input
                                    autoFocus
                                    required
                                    value={nodeName}
                                    onChange={e => setNodeName(e.target.value)}
                                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]"
                                    placeholder="Ex: Contabilidade 2024"
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--border)]">
                                <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 rounded-lg hover:bg-[var(--surface-hover)] text-sm">Cancelar</button>
                                <button type="submit" disabled={submitting} className="px-6 py-2 rounded-lg bg-[var(--accent-primary)] text-white font-medium hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/20 text-sm">
                                    {submitting ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Label Selector Modal */}
            <DossierLabelModal
                isOpen={!!labelingNode}
                node={labelingNode}
                onClose={() => setLabelingNode(null)}
                onSuccess={onRefresh}
            />

            {/* Customize Modal */}
            <DossierCustomizeModal
                isOpen={!!customizingNode}
                node={customizingNode}
                onClose={() => setCustomizingNode(null)}
                onSuccess={onRefresh}
            />

            {/* Link Doc Modal */}
            <DossierLinkDocModal
                isOpen={!!linkingNode}
                node={linkingNode}
                onClose={() => setLinkingNode(null)}
                onSuccess={onRefresh}
            />
        </div>
    );
}
