import React, { useState } from 'react';

/**
 * Minimal stub for SuggestionModal to satisfy CoreV2Tab import.
 * Returns a hook that provides the modal component and an open function.
 */
export function useSuggestionModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [data, setData] = useState(null);

    function openSuggestionModal(payload) {
        setData(payload);
        setIsOpen(true);
    }

    function close() {
        setIsOpen(false);
        setData(null);
    }

    const SuggestionModal = isOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm fade-in">
            <div className="bg-[var(--surface)] p-6 rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border)]">
                <h3 className="text-lg font-bold mb-4">Suggestions</h3>
                <p className="opacity-70 mb-6">Feature coming soon.</p>
                {data && <pre className="text-xs bg-black/5 p-2 rounded mb-4 overflow-auto">{JSON.stringify(data, null, 2)}</pre>}
                <div className="flex justify-end">
                    <button className="btn" onClick={close}>Close</button>
                </div>
            </div>
        </div>
    ) : null;

    return {
        SuggestionModal,
        openSuggestionModal
    };
}
