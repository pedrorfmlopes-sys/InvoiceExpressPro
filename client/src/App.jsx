// client/src/App.jsx
import React, { useEffect, useState } from 'react'
import './styles.css'

import { THEMES } from './shared/ui'
import ProcessTab from './tabs/ProcessTab'
import ExploreTab from './tabs/ExploreTab'
import CoreV2Tab from './tabs/CoreV2Tab'
import NormalizationTab from './tabs/NormalizationTab'
import ReportsTab from './tabs/ReportsTab'
import AuditTab from './tabs/AuditTab'
import TeacherTab from './tabs/TeacherTab'
import ConfigTab from './tabs/ConfigTab'
import TransactionsTab from './tabs/TransactionsTab'

import Login from './components/Login'
import api, { setOnAuthFailure, logout, downloadFile } from './api/apiClient'

export default function App() {
  // Feature Flag
  const ENABLE_LEGACY = import.meta.env.VITE_ENABLE_LEGACY === 'true';

  // -- State: UI --
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'ocean')
  const [project, setProject] = useState(localStorage.getItem('project') || 'default')
  const [projects, setProjects] = useState([])
  const [activeTab, setActiveTab] = useState('corev2');

  // -- State: Auth --
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('user');

  // Helper: Reset Auth State
  const resetAuthState = () => {
    setIsAuthenticated(false);
    setUser(null);
    setRole('user');
    logout(); // Clear token from localStorage/cookies via API helper if needed, mainly local cleanup
  };

  // -- Effects --

  // 1. Auth Init
  useEffect(() => {
    // Global handler for API 401s (e.g. token expired)
    setOnAuthFailure(() => {
      resetAuthState();
    });

    if (localStorage.getItem('token')) {
      checkAuth();
    } else {
      setIsLoading(false);
    }
  }, []);

  // 2. Tab Guard (Role-based)
  useEffect(() => {
    if (!isAuthenticated) return;
    // Redirect if on forbidden tab
    if (role !== 'admin' && activeTab === 'config') {
      setActiveTab('corev2');
    }
  }, [isAuthenticated, role, activeTab]);

  // 3. Persistence
  useEffect(() => {
    if (!THEMES.includes(theme)) setTheme('ocean');
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme)
  }, [theme]);

  useEffect(() => { localStorage.setItem('project', project); }, [project]);

  // -- Logic --

  async function checkAuth() {
    try {
      // Parallel fetch: Verify Token (via Me) and get Projects
      const [meRes, pRes] = await Promise.all([
        api.get('/api/auth/me'),
        api.get('/api/projects')
      ]);

      setUser(meRes.data.user);
      setRole(meRes.data.role || 'user');

      const list = pRes.data.projects || [];
      setProjects(list);
      if (list.length && !list.includes(project)) setProject(list[0]);

      setIsAuthenticated(true);
    } catch (err) {
      console.error('[App] Auth Check Failed:', err);
      resetAuthState();
    } finally {
      setIsLoading(false);
    }
  }

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    await checkAuth();
  };

  const handleDownload = async (e) => {
    e.preventDefault();
    try {
      const data = await downloadFile('/api/export.xlsx', { project });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `export_${project}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (err) { alert('Download falhou'); }
  };

  const createProject = async () => {
    const name = prompt('Nome do projeto:');
    if (name) {
      // Use existing endpoint or keep as is if it worked before
      await api.post('/api/projects', { name });
      window.location.reload();
    }
  };

  // Tabs Configuration
  const TABS = [
    { id: 'dashboard', label: '📊 Dashboard', Component: ReportsTab },
    { id: 'corev2', label: '📄 Core V2', Component: CoreV2Tab },
    { id: 'transactions', label: '💼 Transactions', Component: TransactionsTab },
    { id: 'config', label: '⚙️ Config', Component: ConfigTab },
    ...(ENABLE_LEGACY ? [
      { id: 'process', label: 'Process (V1)', Component: ProcessTab },
      { id: 'teacher', label: 'Teacher', Component: TeacherTab },
      { id: 'explore', label: 'Explore (Old)', Component: ExploreTab },
      { id: 'normalization', label: 'Normalization', Component: NormalizationTab },
      { id: 'audit', label: 'Audit', Component: AuditTab },
    ] : [])
  ];

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    await checkAuth();
  };

  const handleLogout = () => {
    resetAuthState();
  };

  if (isLoading) return <div className="p-10 flex justify-center text-slate-400">Loading...</div>;

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Filter Tabs based on Role
  let visibleTabs = TABS.filter(t => !t.hidden);
  if (role !== 'admin') {
    visibleTabs = visibleTabs.filter(t => t.id !== 'config'); // Hide Config/Admin
  }


  const CurrentComponent = visibleTabs.find(t => t.id === activeTab)?.Component || (() => <div style={{ padding: 20 }}>Not Found</div>);

  return (
    <div className="flex flex-col h-screen bg-slate-50 relative overflow-hidden font-sans">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold shadow-md">
            IS
          </div>
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 tracking-tight">Invoice Studio</h1>
          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium border border-indigo-100">Pro</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 hidden sm:block">
            {user ? `${user.name} (${role})` : ''}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-red-500 transition-colors"
          >
            Sign Out
          </button>
          <a href="https://github.com/pedrorfmlopes/InvoiceStudioGRVTY" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 gap-6 pt-2">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-1 text-sm font-medium transition-all relative ${activeTab === tab.id
              ? 'text-indigo-600'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full" />
            )}
          </button>
        ))}
        <div className="project-selector" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <label className="text-sm text-slate-500 mr-2">Project:</label>
          <select className="input text-sm" value={project} onChange={e => setProject(e.target.value)}>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={createProject} className="ml-2 px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors">+</button>
        </div>
        <div className="user-controls" style={{ display: 'flex', alignItems: 'center', marginLeft: 10 }}>
          <select className="input text-sm" style={{ width: 100 }} value={theme} onChange={e => setTheme(e.target.value)}>
            {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <CurrentComponent project={project} />
      </div>
    </div>
  );
}
