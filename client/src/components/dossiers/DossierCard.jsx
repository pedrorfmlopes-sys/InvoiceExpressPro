import React, { useState, useRef, useEffect } from 'react';
import { IconFolder, IconFolderOpen, IconDotsVertical, IconLink, IconPencil, IconTrash, IconArrowsMove, IconTag, IconSettings } from '@tabler/icons-react';

export default function DossierCard({ node, onClick, onEdit, onDelete, onMove, onAssignLabels, onCustomize, onLinkDoc, onQuickUpdate, uiConfig }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [editField, setEditField] = useState(null); // 'custom_1', 'custom_2'
    const [tempValue, setTempValue] = useState('');

    // Style Parsing
    let style = {};
    try {
        style = typeof node.style === 'string' ? JSON.parse(node.style) : (node.style || {});
    } catch (e) { style = {}; }

    const bgClass = style.bgColor || 'bg-white dark:bg-slate-700';
    const shadowClass = style.shadow ? style.shadow : 'hover:shadow-md';
    const spanClass = style.colSpan || '';

    // Close menu on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    const handleAction = (e, action) => {
        e.stopPropagation();
        setMenuOpen(false);
        if (action === 'edit' && onEdit) onEdit(node);
        if (action === 'delete' && onDelete) onDelete(node);
        if (action === 'labels' && onAssignLabels) onAssignLabels(node);
        if (action === 'customize' && onCustomize) onCustomize(node);
        if (action === 'linkDoc' && onLinkDoc) onLinkDoc(node);
    };

    const handleDragStart = (e) => {
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Allow drop
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceId = e.dataTransfer.getData('text/plain');
        if (sourceId && sourceId !== node.id && onMove) {
            onMove(sourceId, node.id);
        }
    };

    const startEdit = (field, currentVal, e) => {
        e.stopPropagation();
        setEditField(field);
        setTempValue(currentVal || '');
    };

    const saveEdit = () => {
        if (editField && onQuickUpdate) {
            onQuickUpdate(node, { [editField]: tempValue });
        }
        setEditField(null);
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={onClick}
            className={`group relative flex flex-col items-start p-4 rounded-xl border transition-all duration-200 text-left w-full h-auto min-h-[180px]
                ${bgClass} ${spanClass} ${shadowClass === 'none' ? '' : shadowClass}
                border-[var(--border)] hover:border-[var(--border-hover)]
                hover:-translate-y-[1px] active:translate-y-0 ${menuOpen ? 'z-50' : 'z-auto'}`}
        >
            {/* Context Menu Button */}
            <div className="absolute top-2 right-2 z-10" ref={menuRef}>
                <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-base)] rounded-lg transition-colors"
                >
                    <IconDotsVertical size={16} />
                </button>

                {/* Dropdown */}
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-[var(--border)] rounded-lg shadow-xl py-1 z-50 overflow-hidden text-xs">
                        <button onClick={(e) => handleAction(e, 'edit')} className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--text-main)] hover:bg-[var(--surface-hover)]">
                            <IconPencil size={14} /> {uiConfig?.card?.labels?.edit || 'Editar'}
                        </button>
                        <button onClick={(e) => handleAction(e, 'labels')} className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--text-main)] hover:bg-[var(--surface-hover)]">
                            <IconTag size={14} /> {uiConfig?.card?.labels?.labels || 'Etiquetas'}
                        </button>
                        <button onClick={(e) => handleAction(e, 'customize')} className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--text-main)] hover:bg-[var(--surface-hover)]">
                            <IconSettings size={14} /> {uiConfig?.card?.labels?.customize || 'Personalizar'}
                        </button>
                        <button onClick={(e) => handleAction(e, 'linkDoc')} className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--text-main)] hover:bg-[var(--surface-hover)]">
                            <IconLink size={14} /> {uiConfig?.card?.labels?.linkDoc || 'Associar Doc'}
                        </button>
                        <div className="h-px bg-[var(--border)] my-0.5"></div>
                        <button onClick={(e) => handleAction(e, 'delete')} className="flex w-full items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-500/10">
                            <IconTrash size={14} /> {uiConfig?.card?.labels?.delete || 'Apagar'}
                        </button>
                    </div>
                )}
            </div>

            {/* Icon */}
            <div className={`mb-3 text-3xl text-[var(--text-main)] transition-colors ${bgClass.includes('white') || bgClass.includes('slate-700') ? 'group-hover:text-[var(--accent-primary)]' : ''}`}>
                <IconFolder size={32} stroke={1.5} className="group-hover:hidden" />
                <IconFolderOpen size={32} stroke={1.5} className="hidden group-hover:block" />
            </div>

            {/* Text Content */}
            <div className="w-full flex-1">
                <div className="font-bold text-sm text-[var(--text-main)] leading-tight line-clamp-2" title={node.name}>
                    {node.name}
                </div>
                {node.code && (
                    <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] mt-1 opacity-80">
                        {node.code}
                    </div>
                )}

                {/* Custom Fields */}
                <div className="mt-3 flex flex-col gap-1 w-full" onClick={e => e.stopPropagation()}>
                    {/* Field 1 */}
                    <div className="flex items-center gap-1 group/field h-6">
                        {editField === 'custom_1' ? (
                            <input
                                autoFocus
                                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 ring-[var(--accent-primary)]"
                                value={tempValue}
                                onChange={e => setTempValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                placeholder="Campo 1..."
                            />
                        ) : (
                            <div className="flex items-center w-full gap-2">
                                <span className={`text-xs truncate flex-1 block ${!node.custom_1 ? 'opacity-30 italic' : 'text-[var(--text-muted)]'}`} title={node.custom_1}>
                                    {node.custom_1 || "Campo 1"}
                                </span>
                                <button
                                    onClick={(e) => startEdit('custom_1', node.custom_1, e)}
                                    className="opacity-0 group-hover/field:opacity-100 p-1 hover:bg-[var(--surface-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
                                >
                                    <IconPencil size={12} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Field 2 */}
                    <div className="flex items-center gap-1 group/field h-6">
                        {editField === 'custom_2' ? (
                            <input
                                autoFocus
                                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 ring-[var(--accent-primary)]"
                                value={tempValue}
                                onChange={e => setTempValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                placeholder="Campo 2..."
                            />
                        ) : (
                            <div className="flex items-center w-full gap-2">
                                <span className={`text-xs truncate flex-1 block ${!node.custom_2 ? 'opacity-30 italic' : 'text-[var(--text-muted)]'}`} title={node.custom_2}>
                                    {node.custom_2 || "Campo 2"}
                                </span>
                                <button
                                    onClick={(e) => startEdit('custom_2', node.custom_2, e)}
                                    className="opacity-0 group-hover/field:opacity-100 p-1 hover:bg-[var(--surface-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
                                >
                                    <IconPencil size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Labels Badges */}
                {node.labels && node.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {node.labels.slice(0, 3).map(lbl => (
                            <span key={lbl.id} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-active)] border border-[var(--border)] flex items-center gap-1 max-w-[80px] truncate">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }}></span>
                                <span className="truncate">{lbl.name}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer Stats */}
            <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--text-muted)] w-full border-t border-[var(--border)] pt-2 opacity-60 group-hover:opacity-100 transition-opacity z-10">
                <span className="flex items-center gap-1" title="Sub-projetos">
                    <IconFolder size={12} /> {node.child_count || 0}
                </span>
                <span className="flex items-center gap-1" title="Documentos">
                    <IconLink size={12} /> {node.doc_count || 0}
                </span>
                {node.archived && <span className="ml-auto text-amber-500 font-bold">ARQ</span>}
            </div>

            {/* Custom Icon */}
            {node.icon_asset_id && (
                <div className="absolute bottom-2 right-2 w-12 h-12 p-1 opacity-40 group-hover:opacity-100 transition-all duration-300 pointer-events-none select-none z-0">
                    <img
                        src={`/api/assets/${node.icon_asset_id}`}
                        alt="icon"
                        className="w-full h-full object-contain drop-shadow-sm"
                    />
                </div>
            )}

        </div>
    );
}
