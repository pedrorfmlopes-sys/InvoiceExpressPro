import React, { useState, useEffect } from 'react';
import api from '../api/apiClient';
import DossierBrowser from '../components/dossiers/DossierBrowser';
import DossierSearchBox from '../components/dossiers/DossierSearchBox';

export default function ProjectsTab() {
    const [currentParent, setCurrentParent] = useState(null); // ID or null (root)
    const [breadcrumbs, setBreadcrumbs] = useState([]); // [{id,name}, ...]
    const [nodes, setNodes] = useState([]);
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [archivedMode, setArchivedMode] = useState('active'); // 'active', 'archived', 'all'
    const [viewMode, setViewMode] = useState('browser'); // 'browser' or 'search'

    // Load Nodes when parent changes or filters change
    useEffect(() => {
        loadNodes();
        loadPath();
    }, [currentParent, archivedMode]);

    const loadNodes = async () => {
        setLoading(true);
        try {
            const params = {
                parentId: currentParent || 'null',
                archived: archivedMode === 'active' ? 'false' : (archivedMode === 'archived' ? 'true' : 'all')
            };

            // Parallel fetch
            const promises = [api.get('/api/dossiers/nodes', { params })];
            if (currentParent) {
                promises.push(api.get(`/api/dossiers/nodes/${currentParent}/docs`));
            }

            const [nodesRes, docsRes] = await Promise.all(promises);

            if (Array.isArray(nodesRes.data)) {
                setNodes(nodesRes.data);
            } else {
                setNodes([]);
            }

            if (currentParent && docsRes && Array.isArray(docsRes.data)) {
                setDocs(docsRes.data);
            } else {
                setDocs([]);
            }

        } catch (e) {
            console.error("Failed to load data", e);
        } finally {
            setLoading(false);
        }
    };

    const loadPath = async () => {
        if (!currentParent) {
            setBreadcrumbs([]);
            return;
        }
        try {
            const res = await api.get(`/api/dossiers/nodes/${currentParent}/path`);
            setBreadcrumbs(res.data);
        } catch (e) {
            console.error("Failed path", e);
        }
    };

    const handleNavigate = (nodeId) => {
        setCurrentParent(nodeId);
        setViewMode('browser');
    };

    const handleSearchSelect = (node) => {
        // Teleport
        setCurrentParent(node.id);
        setViewMode('browser');
    };

    const handleViewDoc = async (doc) => {
        try {
            const res = await api.get(`/api/doc/view?id=${doc.id}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (e) {
            console.error(e);
            alert("Erro ao abrir documento.");
        }
    };

    const handleUnlinkDoc = async (doc) => {
        if (!confirm('Desassociar documento deste dossier?')) return;
        try {
            await api.delete(`/api/dossiers/nodes/${currentParent}/docs/${doc.id}`);
            loadNodes();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)]">
            {/* Header / Search */}
            <div className="h-14 border-b bg-white flex items-center px-4 justify-between shadow-sm z-10">
                <div className="flex items-center gap-4 w-full">
                    <h2 className="text-lg font-bold text-slate-700 hidden md:block">Projetos</h2>
                    <div className="flex-1 max-w-2xl">
                        <DossierSearchBox onSelect={handleSearchSelect} />
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            className="border rounded px-2 py-1 text-sm bg-gray-50 text-slate-700"
                            value={archivedMode}
                            onChange={e => setArchivedMode(e.target.value)}
                        >
                            <option value="active">Ativos</option>
                            <option value="archived">Arquivados</option>
                            <option value="all">Todos</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                <DossierBrowser
                    loading={loading}
                    nodes={nodes}
                    docs={docs}
                    breadcrumbs={breadcrumbs}
                    currentParent={currentParent}
                    onNavigate={handleNavigate}
                    onRefresh={loadNodes}
                    onViewDoc={handleViewDoc}
                    onUnlinkDoc={handleUnlinkDoc}
                />
            </div>
        </div>
    );
}
