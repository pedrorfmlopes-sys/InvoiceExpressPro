import React from 'react';

export function Topbar({
    user,
    role,
    onLogout,
    theme,
    setTheme,
    accent,
    setAccent,
    project,
    projects,
    setProject
}) {
    return (
        <header className="shell-topbar">
            {/* Left: Search (Visual Only) */}
            <div className="flex items-center w-full max-w-md">
                <div className="relative w-full">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <input
                        type="text"
                        placeholder="Search documents, batches..."
                        className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-transparent rounded-lg text-sm transition-all focus:bg-transparent focus:border-[var(--accent-primary)] outline-none"
                        style={{ color: 'var(--text-main)' }}
                    />
                </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 ml-4">

                {/* Project Selector */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-[var(--sidebar-border)]">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-50">Prj</span>
                    <select
                        value={project}
                        onChange={e => setProject(e.target.value)}
                        className="bg-transparent border-none text-sm font-medium outline-none cursor-pointer"
                        style={{ color: 'var(--text-main)' }}
                    >
                        {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                {/* Accent Selector */}
                <select
                    value={accent}
                    onChange={e => setAccent(e.target.value)}
                    className="bg-transparent text-xs font-medium uppercase tracking-wide cursor-pointer outline-none opacity-70 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <option value="teal">Teal</option>
                    <option value="blue">Blue</option>
                    <option value="mono">Mono</option>
                </select>

                {/* Theme Toggle */}
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? (
                        <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    ) : (
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                    )}
                </button>

                {/* User */}
                <div className="flex items-center gap-3 pl-4 border-l border-[var(--glass-border)]">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{user?.name || 'User'}</div>
                        <div className="text-xs opacity-60 capitalize">{role}</div>
                    </div>
                    <button onClick={onLogout} className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    </button>
                </div>
            </div>
        </header>
    );
}
