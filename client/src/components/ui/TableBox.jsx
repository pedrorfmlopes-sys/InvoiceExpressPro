import React from 'react';
import { GlassCard } from './GlassCard';

/**
 * TableBox - A container for tables with fixed header/footer and internal scroll.
 * Uses GlassCard styling but overrides overflow for structural layout.
 */
export function TableBox({ header, footer, children, className = '', ...props }) {
    return (
        <GlassCard
            className={`flex flex-col p-0 overflow-hidden flex-1 min-h-[400px] max-h-[calc(100vh-250px)] ${className}`}
            {...props}
        >
            {/* Fixed Header */}
            {header && (
                <div className="shrink-0 p-4 border-b border-[var(--border)] bg-[var(--surface)] z-10">
                    {header}
                </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-auto relative">
                {children}
            </div>

            {/* Fixed Footer */}
            {footer && (
                <div className="shrink-0 p-3 border-t border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-muted)] z-10">
                    {footer}
                </div>
            )}
        </GlassCard>
    );
}
