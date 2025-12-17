import React from 'react';

/**
 * ActionCard - A small 3D-style button/card for quick actions.
 * @param {React.ReactNode} icon - Icon component or emoji
 * @param {string} title - Main label
 * @param {string} subtitle - Optional helper text
 * @param {function} onClick - Click handler
 * @param {boolean} active - If true, shows active state styling
 * @param {string} className - Extra classes
 */
export function ActionCard({ icon, title, subtitle, onClick, active, className = '' }) {
    return (
        <button
            onClick={onClick}
            className={`
                group relative flex flex-col items-start justify-center p-4 rounded-xl border transition-all duration-200 text-left w-full
                hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 active:shadow-sm
                ${active
                    ? 'bg-[var(--surface-active)] border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
                    : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-hover)]'
                }
                ${className}
            `}
        >
            <div className={`mb-2 text-xl ${active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors'}`}>
                {icon}
            </div>
            <div className="font-bold text-sm text-[var(--text-main)] leading-tight">
                {title}
            </div>
            {subtitle && (
                <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] mt-1 opacity-80 group-hover:opacity-100">
                    {subtitle}
                </div>
            )}
        </button>
    );
}
