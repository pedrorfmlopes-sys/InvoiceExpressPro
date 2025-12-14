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

  // State
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'ocean')
  const [project, setProject] = useState(localStorage.getItem('project') || 'default')
  const [projects, setProjects] = useState([])
  const [activeTab, setActiveTab] = useState('corev2');

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  // Auth Init
  useEffect(() => {
    setOnAuthFailure(() => setIsAuthenticated(false));
    if (localStorage.getItem('token')) checkAuth();
    else setLoading(false);
  }, []);

  // Theme & Project Persistence
  useEffect(() => {
    if (!THEMES.includes(theme)) setTheme('ocean');
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme)
  }, [theme]);

  useEffect(() => { localStorage.setItem('project', project); }, [project]);

  // Load Projects
  useEffect(() => {
    if (isAuthenticated) {
      api.get('/api/projects').then(res => {
        const list = res.data.projects || [];
        setProjects(list);
        if (list.length && !list.includes(project)) setProject(list[0]);
      }).catch(e => console.error(e));
    }
  }, [isAuthenticated]);

  async function checkAuth() {
    try {
      await api.get('/api/projects');
      setIsAuthenticated(true);
    } catch (err) {
      if (err.response && err.response.status === 401) setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
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

  const CurrentComponent = TABS.find(t => t.id === activeTab)?.Component || (() => <div style={{ padding: 20 }}>Not Found</div>);

  if (loading) return <div className="container" style={{ display: 'center', justifyContent: 'center' }}>Loading...</div>;
  if (!isAuthenticated) return <Login onLoginSuccess={() => { setIsAuthenticated(true); checkAuth(); }} />;

  return (
    <div className={`app-container ${theme}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Bar */}
      <div className="top-bar">
        <div className="brand">InvoiceStudio <span className="version">v2.5</span></div>
        <div className="project-selector">
          <label>Project:</label>
          <select value={project} onChange={e => setProject(e.target.value)}>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={createProject} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', marginLeft: 5, fontSize: 10 }}>+</button>
        </div>
        <div className="spacer" />
        <div className="user-controls">
          <select className="input" style={{ width: 100, marginRight: 10 }} value={theme} onChange={e => setTheme(e.target.value)}>
            {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="sidebar">
          {TABS.map(t => (
            <div key={t.id}
              className={`nav-item ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
            </div>
          ))}
          <div style={{ marginTop: 'auto', padding: 10, fontSize: '0.8em', opacity: 0.5 }}>
            <a href="#" onClick={handleDownload} style={{ color: 'inherit' }}>Export All Excel</a>
          </div>
        </div>

        {/* Content */}
        <div className="content-area">
          <CurrentComponent project={project} />
        </div>
      </div>
    </div>
  );
}
