import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; // Import hook

function NavGroup({ title, expanded, onToggle, children }) {
    return (
        <div className="flex flex-col gap-1 mb-2">
            <button
                onClick={onToggle}
                className="flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-widest font-bold opacity-50 hover:opacity-100 transition-opacity w-full text-left"
            >
                <span>{title}</span>
                <span className={`transform transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span>
            </button>
            <div className={`flex flex-col gap-1 overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {children}
            </div>
        </div>
    );
}

export function Sidebar({ tabs, activeTab, onTabChange }) {
    const { t } = useTranslation(); // Use hook
    // Grouping logic
    const primaryTabs = tabs.filter(t => !['health', 'config'].includes(t.id));
    const systemTabs = tabs.filter(t => ['health', 'config'].includes(t.id));

    // Persist expanded state
    const [groupsState, setGroupsState] = useState(() => {
        try {
            const saved = localStorage.getItem('sidebar-groups');
            return saved ? JSON.parse(saved) : { menu: true, system: true };
        } catch {
            return { menu: true, system: true };
        }
    });

    const toggleGroup = (key) => {
        const newState = { ...groupsState, [key]: !groupsState[key] };
        setGroupsState(newState);
        localStorage.setItem('sidebar-groups', JSON.stringify(newState));
    };

    const NavItem = ({ tab }) => {
        if (tab.hidden) return null;
        const isActive = activeTab === tab.id;
        return (
            <button
                onClick={() => onTabChange(tab.id)}
                className={`
                    group w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-all duration-200 text-sm font-medium relative overflow-hidden max-w-[calc(100%-16px)]
                    ${isActive
                        ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shadow-sm ring-1 ring-[var(--accent-primary)]/20'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-main)]'}
                `}
            >
                {/* Active Indicator Bar */}
                {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--accent-primary)] rounded-r-full" />
                )}

                {/* Icon Placeholder (if needed, or just first letter) */}
                <span className={`transition-colors ${isActive ? 'text-[var(--accent-primary)]' : 'opacity-50 group-hover:opacity-100'}`}>
                    {/* We could inject icons here if they exist in tab obj */}
                </span>

                <span className={isActive ? 'font-semibold ml-1' : 'ml-1'}>{tab.label}</span>

                {isActive && (
                    <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]" />
                )}
            </button>
        )
    };

    return (
        <aside className="shell-sidebar flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] w-[260px] shrink-0 z-50">
            {/* Header / Brand */}
            <div className="h-[72px] shrink-0 flex items-center px-6 border-b border-[var(--sidebar-border)] mb-4">
                <div className="flex items-center gap-3 select-none">
                    <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-[var(--accent-primary)]/20"
                        style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
                    >
                        IS
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-base leading-none tracking-tight text-[var(--text-main)]">
                            Invoice Studio
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-40 mt-1">Workspace</span>
                    </div>
                </div>
            </div>

            {/* Nav Content */}
            <nav className="flex-1 overflow-y-auto px-2 pb-6 custom-scrollbar">

                <NavGroup
                    title={t('sidebar.workspace')}
                    expanded={groupsState.menu}
                    onToggle={() => toggleGroup('menu')}
                >
                    {primaryTabs.map(tab => <NavItem key={tab.id} tab={tab} />)}
                </NavGroup>

                <div className="my-4 border-t border-[var(--sidebar-border)] opacity-50 mx-4" />

                <NavGroup
                    title={t('sidebar.system')}
                    expanded={groupsState.system}
                    onToggle={() => toggleGroup('system')}
                >
                    {systemTabs.map(tab => <NavItem key={tab.id} tab={tab} />)}
                </NavGroup>

            </nav>

            {/* User / Footer */}
            <div className="shrink-0 p-4 border-t border-[var(--sidebar-border)] mt-auto">
                <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--sidebar-border)] bg-[var(--bg-base)] hover:border-[var(--accent-primary)]/30 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-secondary)] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        AD
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold truncate group-hover:text-[var(--accent-primary)] transition-colors">Admin User</span>
                        <span className="text-[10px] opacity-50 truncate">admin@invoice.studio</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
