import React from 'react';

export function GlassCard({ children, className = '', ...props }) {
    return (
        <div
            className={`glass-panel rounded-xl p-6 ${className}`}
            style={{ borderRadius: 'var(--radius-lg)' }}
            {...props}
        >
            {children}
        </div>
    );
}
