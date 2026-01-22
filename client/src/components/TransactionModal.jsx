import React from 'react';

/**
 * Minimal stub for TransactionModal to satisfy CoreV2Tab import.
 */
export function TransactionModal({ doc, onClose }) {
    if (!doc) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm fade-in">
            <div className="bg-[var(--surface)] p-6 rounded-2xl shadow-2xl max-w-lg w-full border border-[var(--border)]">
                <h3 className="text-lg font-bold mb-2">Transaction Details</h3>
                <p className="text-sm opacity-60 mb-4">Document: {doc.docNumber || 'N/A'}</p>
                <div className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border)] mb-6 text-center text-[var(--text-muted)]">
                    Transaction editing logic will be implemented here.
                </div>
                <div className="flex justify-end gap-2">
                    <button className="btn" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
