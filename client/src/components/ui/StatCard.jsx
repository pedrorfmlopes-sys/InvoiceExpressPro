import React from 'react';

export function StatCard({ label, value, subtext, icon, gradientVar }) {
    // Extract a color hint from the gradient var name if possible, or default to primary
    // Map var(--grad-stat1) -> text-teal-400 etc is hard dynamically without context.
    // Instead we use the glass card style but add a colored icon container.

    // Simple mapping for demo based on the passed var (hacky but effective without changing props interface)
    let accentStyle = { background: gradientVar, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' };
    let iconBg = { background: gradientVar, opacity: 0.15 };
    let iconColor = { color: 'var(--text-main)' }; // Fallback

    return (
        <div className="glass-panel flex flex-col justify-between h-full p-6 transition-transform hover:-translate-y-1 duration-300">
            <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium opacity-60 uppercase tracking-wider">{label}</span>
                {icon && (
                    <div className="p-2 rounded-lg" style={iconBg}>
                        {/* We clone element to force size/color if needed, or just render */}
                        <div style={{ opacity: 0.8 }}>{icon}</div>
                    </div>
                )}
            </div>

            <div className="mt-2">
                <div className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                    {value}
                </div>
                {subtext && (
                    <div className="text-xs font-medium mt-1 flex items-center gap-1 opacity-50">
                        {subtext}
                    </div>
                )}
            </div>
        </div>
    );
}
