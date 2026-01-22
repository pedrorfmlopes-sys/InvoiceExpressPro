import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({
    children,
    tabs,
    activeTab,
    setActiveTab,
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
        <div className="app-shell">
            <Sidebar
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />
            <Topbar
                user={user}
                role={role}
                onLogout={onLogout}
                theme={theme}
                setTheme={setTheme}
                accent={accent}
                setAccent={setAccent}
                project={project}
                projects={projects}
                setProject={setProject}
            />

            <main className="shell-content fade-in">
                <div className="w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
