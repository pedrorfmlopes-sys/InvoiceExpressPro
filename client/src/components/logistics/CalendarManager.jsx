import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/apiClient';
import { FiCalendar, FiPlus, FiTrash2, FiSave, FiAlertCircle } from 'react-icons/fi';

export default function CalendarManager({ brand, onClose }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // New Event Form
    const [newEvent, setNewEvent] = useState({
        description: '',
        start_date: '',
        end_date: '',
        is_recurring: true
    });

    useEffect(() => {
        if (brand) fetchEvents();
    }, [brand]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/logistics/calendar/${brand.id}/events`);
            setEvents(res.data);
        } catch (err) {
            console.error("Failed to load events", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddEvent = async () => {
        if (!newEvent.description || !newEvent.start_date || !newEvent.end_date) {
            alert("Preencha todos os campos obrigatórios.");
            return;
        }

        try {
            setSaving(true);
            await api.post(`/api/logistics/calendar/${brand.id}/events`, newEvent);
            setNewEvent({ description: '', start_date: '', end_date: '', is_recurring: true });
            await fetchEvents();
        } catch (err) {
            alert("Erro ao criar evento: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        if (!confirm("Tem a certeza que deseja remover este evento?")) return;
        try {
            await api.delete(`/api/logistics/calendar/events/${eventId}`);
            setEvents(prev => prev.filter(e => e.id !== eventId));
        } catch (err) {
            alert("Erro ao apagar evento: " + err.message);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[12000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl animate-fade-in relative">

                {/* HEADER */}
                <div className="flex justify-between items-center p-6 border-b border-[#333] bg-[#0e0e0e] rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-lg bg-${brand.color || 'amber'}-500/20 flex items-center justify-center text-${brand.color || 'amber'}-500`}>
                                <FiCalendar />
                            </span>
                            Calendário Fabril {brand.name}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Configure paragens, férias e feriados para cálculo automático de prazos.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white px-4 py-2 hover:bg-white/5 rounded-lg transition-all">
                        Fechar
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

                    {/* LEFT: FORM */}
                    <div className="w-full md:w-1/3 bg-[#151515] border-r border-[#333] p-6 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-[#333] pb-2">Novo Evento / Paragem</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Descrição</label>
                                    <input
                                        className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                                        placeholder="Ex: Férias de Verão"
                                        value={newEvent.description}
                                        onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Início</label>
                                        <input
                                            type="date"
                                            className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                                            value={newEvent.start_date}
                                            onChange={e => setNewEvent({ ...newEvent, start_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Fim</label>
                                        <input
                                            type="date"
                                            className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                                            value={newEvent.end_date}
                                            onChange={e => setNewEvent({ ...newEvent, end_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 p-3 bg-[#0a0a0a] border border-[#333] rounded-lg cursor-pointer hover:border-gray-500 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={newEvent.is_recurring}
                                        onChange={e => setNewEvent({ ...newEvent, is_recurring: e.target.checked })}
                                        className="w-4 h-4 accent-amber-500"
                                    />
                                    <div>
                                        <div className="text-xs font-bold text-gray-300">Evento Recorrente</div>
                                        <div className="text-[10px] text-gray-500">Repete-se todos os anos nestas datas</div>
                                    </div>
                                </label>

                                <button
                                    onClick={handleAddEvent}
                                    disabled={saving}
                                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
                                >
                                    {saving ? 'A guardar...' : <><FiPlus /> Adicionar Evento</>}
                                </button>
                            </div>
                        </div>

                        <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-xl">
                            <h4 className="flex items-center gap-2 text-blue-400 font-bold text-xs mb-2">
                                <FiAlertCircle /> Como funciona?
                            </h4>
                            <p className="text-[11px] text-blue-300/70 leading-relaxed">
                                Os eventos aqui configurados são considerados "Paragens de Fábrica".
                                Durante o cálculo de prazos, se uma data prevista cair dentro destas datas, o prazo será estendido automaticamente pela duração da paragem.
                            </p>
                        </div>
                    </div>

                    {/* RIGHT: LIST */}
                    <div className="flex-1 bg-[#0a0a0a] p-6 overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Eventos Ativos</h3>
                            <span className="text-[10px] bg-[#222] px-2 py-1 rounded text-gray-500">{events.length} eventos</span>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-20 text-gray-600 animate-pulse">A carregar...</div>
                        ) : events.length === 0 ? (
                            <div className="text-center py-20 border-2 border-dashed border-[#222] rounded-xl">
                                <p className="text-gray-500 text-sm">Nenhum evento configurado.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {events.map(ev => (
                                    <div key={ev.id} className="bg-[#151515] border border-[#333] p-4 rounded-xl flex items-center justify-between group hover:border-[#555] transition-colors">
                                        <div className="flex gap-4 items-center">
                                            <div className="flex flex-col items-center bg-[#222] border border-[#333] rounded-lg p-2 min-w-[60px]">
                                                <span className="text-[10px] text-gray-500 uppercase font-bold">{new Date(ev.start_date).toLocaleString('default', { month: 'short' })}</span>
                                                <span className="text-xl font-bold text-white">{new Date(ev.start_date).getDate()}</span>
                                            </div>
                                            <div className="h-px w-4 bg-[#333]" />
                                            <div className="flex flex-col items-center bg-[#222] border border-[#333] rounded-lg p-2 min-w-[60px]">
                                                <span className="text-[10px] text-gray-500 uppercase font-bold">{new Date(ev.end_date).toLocaleString('default', { month: 'short' })}</span>
                                                <span className="text-xl font-bold text-white">{new Date(ev.end_date).getDate()}</span>
                                            </div>

                                            <div className="ml-4">
                                                <h4 className="font-bold text-gray-200">{ev.description}</h4>
                                                <div className="flex gap-2 mt-1">
                                                    {ev.is_recurring && (
                                                        <span className="text-[9px] bg-indigo-900/30 text-indigo-400 border border-indigo-900/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Recorrente</span>
                                                    )}
                                                    <span className="text-[9px] text-gray-500 px-1.5 py-0.5">
                                                        {Math.round((new Date(ev.end_date) - new Date(ev.start_date)) / (1000 * 60 * 60 * 24))} dias
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleDeleteEvent(ev.id)}
                                            className="p-3 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <FiTrash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
            `}} />
        </div>,
        document.body
    );
}
