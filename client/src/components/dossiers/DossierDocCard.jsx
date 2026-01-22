import React, { useState, useRef, useEffect } from 'react';
import { IconFileText, IconDotsVertical, IconEye, IconUnlink } from '@tabler/icons-react';

export default function DossierDocCard({ doc, onView, onUnlink }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

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
        if (action === 'view' && onView) onView(doc);
        if (action === 'unlink' && onUnlink) onUnlink(doc);
    };

    return (
        <div
            className="group relative flex flex-col items-start justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)] hover:-translate-y-[1px] transition-all duration-200 h-40"
            onClick={() => onView && onView(doc)}
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
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-[var(--border)] rounded-lg shadow-xl py-1 z-50 overflow-hidden text-xs">
                        <button onClick={(e) => handleAction(e, 'view')} className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--text-main)] hover:bg-[var(--surface-hover)]">
                            <IconEye size={14} /> Visualizar
                        </button>
                        <div className="h-px bg-[var(--border)] my-0.5"></div>
                        <button onClick={(e) => handleAction(e, 'unlink')} className="flex w-full items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-500/10">
                            <IconUnlink size={14} /> Desassociar
                        </button>
                    </div>
                )}
            </div>

            {/* Icon */}
            <div className="mb-3 text-[var(--accent-secondary)] opacity-80 group-hover:opacity-100 transition-opacity">
                <IconFileText size={42} stroke={1.2} />
            </div>

            {/* Content */}
            <div className="w-full">
                <div className="font-bold text-sm text-[var(--text-main)] leading-tight line-clamp-2" title={doc.docNumber}>
                    {doc.supplier_name || doc.supplier || 'Fornecedor Desconhecido'}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1 opacity-80">
                    {doc.docType || 'Doc'} {doc.docNumber || doc.invoice_no}
                </div>
                {doc.date && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{doc.date.substring(0, 10)}</div>}
            </div>

            {/* Footer Stats / Size */}
            <div className="mt-auto w-full pt-2 flex justify-between items-end">
                {doc.total && <span className="text-xs font-bold text-[var(--text-main)]">{doc.total} €</span>}
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide opacity-50">PDF</span>
            </div>
        </div>
    );
}
