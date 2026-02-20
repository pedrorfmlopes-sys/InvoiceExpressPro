import React from 'react';
import ReactDOM from 'react-dom';
import { qp } from '../../shared/ui';

export default function SimpleDocViewer({ doc, onClose }) {
    const project = doc.project || 'default';
    // Use 'all' project context if none provided to ensure global lookup
    const url = qp(`/api/corev2/docs/${doc.id}/view`, project === 'default' ? 'all' : project);

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[7000] bg-black/90 flex flex-col font-sans text-xs w-screen h-screen">
            <div className="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-gray-300 font-bold tracking-wider flex items-center gap-2">
                        <span className="text-blue-500">VISUALIZADOR RÁPIDO</span>
                        <span className="opacity-30">|</span>
                        {doc.docNumber || doc.number || 'Documento Sem Número'}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors p-2"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                </button>
            </div>
            <div className="flex-1 bg-[#101010] relative">
                <iframe src={url} className="w-full h-full border-none block" title="Document Preview" />
            </div>
        </div>,
        document.body
    );
}
