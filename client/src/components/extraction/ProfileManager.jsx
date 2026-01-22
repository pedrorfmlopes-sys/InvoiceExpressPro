import React, { useState, useEffect } from 'react';
import { IconPlus, IconEdit, IconTrash, IconSearch } from '@tabler/icons-react';
import api from '../../api/apiClient';
import ProfileEditor from './ProfileEditor';

export default function ProfileManager() {
    const [profiles, setProfiles] = useState([]);
    const [editingProfileId, setEditingProfileId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            const res = await api.get('/api/extraction/profiles');
            setProfiles(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        const name = prompt("Nome do novo perfil:");
        if (!name) return;
        try {
            const res = await api.post('/api/extraction/profiles', { name, doc_type: 'invoice', priority: 5 });
            setProfiles([res.data, ...profiles]);
            setEditingProfileId(res.data.id);
        } catch (err) {
            alert("Erro ao criar perfil");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Tem a certeza que deseja eliminar este perfil?")) return;
        try {
            await api.delete(`/api/extraction/profiles/${id}`);
            setProfiles(profiles.filter(p => p.id !== id));
        } catch (err) {
            alert("Erro ao eliminar");
        }
    };

    const filtered = profiles.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    if (editingProfileId) {
        return <ProfileEditor profileId={editingProfileId} onClose={() => { setEditingProfileId(null); fetchProfiles(); }} />;
    }

    return (
        <div className="flex flex-col h-full bg-[#111] text-white">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1e1e1e]">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold">Perfis de Extração</h1>
                    <div className="relative">
                        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            className="pl-9 pr-4 py-1.5 bg-[#252525] border border-white/10 rounded text-sm focus:outline-none focus:border-blue-500"
                            placeholder="Pesquisar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
                >
                    <IconPlus size={18} /> Novo Perfil
                </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="text-center text-gray-500 mt-10">Carregando...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filtered.map(profile => (
                            <div key={profile.id} className="bg-[#1e1e1e] border border-white/10 rounded-lg p-4 hover:border-blue-500/50 transition-colors group relative">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-lg">{profile.name}</span>
                                        <span className="text-xs text-gray-400 uppercase">{profile.doc_type}</span>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded ${profile.active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                                        {profile.active ? 'ATIVO' : 'INATIVO'}
                                    </span>
                                </div>

                                <div className="mt-4 flex gap-2">
                                    <button
                                        onClick={() => setEditingProfileId(profile.id)}
                                        className="flex-1 py-1.5 bg-[#252525] hover:bg-[#333] rounded text-sm flex items-center justify-center gap-2 border border-white/5"
                                    >
                                        <IconEdit size={14} /> Editar
                                    </button>
                                    <button
                                        onClick={() => handleDelete(profile.id)}
                                        className="px-3 py-1.5 bg-red-900/10 hover:bg-red-900/30 text-red-400 rounded border border-red-900/20"
                                    >
                                        <IconTrash size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
