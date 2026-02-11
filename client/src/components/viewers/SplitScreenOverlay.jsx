import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export function SplitScreenOverlay({ title, pdfUrl, onClose, onReprocess, children }) {
    const [showPdf, setShowPdf] = useState(true);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0f172a] text-slate-200 animate-in fade-in duration-200 overflow-hidden font-sans">
            {/* Header Area */}
            <div className="h-16 bg-[#1e293b] border-b border-slate-700/50 flex items-center justify-between px-6 shrink-0 shadow-lg">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
                    <div className="flex gap-2 ml-4">
                        <button
                            onClick={() => setShowPdf(!showPdf)}
                            className="flex items-center gap-2 px-4 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-md text-sm font-medium transition-all border border-slate-600/50"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
                        </button>
                        {onReprocess && (
                            <button
                                onClick={onReprocess}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-md text-sm font-medium transition-all border border-blue-500/30"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Reprocessar
                            </button>
                        )}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#0f172a]`}>
                {/* PDF Viewer Section (Toggleable) */}
                {showPdf && (
                    <div className="w-full h-[450px] shrink-0 border-b border-slate-700/50 bg-[#020617] relative">
                        <iframe src={pdfUrl} className="w-full h-full border-none" />
                    </div>
                )}

                {/* Data Section (Specialized Viewer Content) */}
                <div className="flex-1 min-h-0 relative">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
