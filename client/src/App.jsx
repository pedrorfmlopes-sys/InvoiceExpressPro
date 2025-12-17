// client/src/App.jsx
import React, { useEffect, useState } from 'react'
import './styles.css'
import './theme.css' // New Theme Tokens

import { THEMES } from './shared/ui' // Keeping for reference if used elsewhere, but we might eventually deprecate
import ProcessTab from './tabs/ProcessTab'
import ExploreTab from './tabs/ExploreTab'
import CoreV2Tab from './tabs/CoreV2Tab'
import NormalizationTab from './tabs/NormalizationTab'
import DashboardNew from './tabs/DashboardNew' // New Dashboard
import ReportsTab from './tabs/ReportsTab'

import AuditTab from './tabs/AuditTab'
import TeacherTab from './tabs/TeacherTab'
import ConfigTab from './tabs/ConfigTab'
import TransactionsTab from './tabs/TransactionsTab'
import SystemHealthTab from './tabs/SystemHealthTab'

import Login from './components/Login'
import { AppShell } from './components/layout/AppShell' // New Layout
import { ErrorBoundary } from './components/ErrorBoundary'
import api, { setOnAuthFailure, logout } from './api/apiClient'
import { useTranslation } from 'react-i18next'

export default function App() {
  const { t } = useTranslation();
  // Feature Flag
  const ENABLE_LEGACY = import.meta.env.VITE_ENABLE_LEGACY === 'true';

  // -- State: UI --
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark') // Default to dark per request "Premium"
  const [accent, setAccent] = useState(localStorage.getItem('accent') || 'teal')
  const [project, setProject] = useState(localStorage.getItem('project') || 'default')
  const [projects, setProjects] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard'); // Default to Dashboard

  // -- State: Auth & Boot --
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))
  // bootStatus: 'idle' | 'loading' | 'ready' | 'error'
  const [bootStatus, setBootStatus] = useState('idle');
  const [bootError, setBootError] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('user');

  // Helper: Reset Auth State
  const resetAuthState = (fullReset = false) => {
    setIsAuthenticated(false);
    setUser(null);
    setRole('user');
    // Only clear token if explicit logout or 401 (fullReset)
    // For network errors/304, we might want to keep it to allow retry
    if (fullReset) {
      localStorage.removeItem('token');
      setBootStatus('idle'); // Back to login
    }
  };

  // -- Effects --

  // 1. Auth Init
  useEffect(() => {
    setOnAuthFailure(() => {
      resetAuthState(true);
    });

    if (localStorage.getItem('token')) {
      checkAuth();
    } else {
      setBootStatus('idle'); // Ready for login
    }
  }, []);

  // 2. Tab Guard
  useEffect(() => {
    if (!isAuthenticated) return;
    if (role !== 'admin' && activeTab === 'config') {
      setActiveTab('dashboard');
    }
  }, [isAuthenticated, role, activeTab]);

  // 3. Persistence (Theme & Accent)
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    localStorage.setItem('theme', theme)
    localStorage.setItem('accent', accent)
  }, [theme, accent]);

  useEffect(() => { localStorage.setItem('project', project); }, [project]);

  // -- Logic --

  async function checkAuth(retryCount = 0) {
    if (bootStatus !== 'ready') setBootStatus('loading');
    setBootError(null);

    try {
      // 1. Fetch User (Critical)
      // Retry logic for 304/Empty body
      let meRes;
      try {
        meRes = await api.get('/api/auth/me');
      } catch (err) {
        // Retry once on specific errors (like 304 empty or network glitch)
        if (retryCount < 1) {
          console.log('[App] /me failed, retrying with cache-buster...', err.message);
          await new Promise(r => setTimeout(r, 500));
          return checkAuth(retryCount + 1);
        }
        throw err;
      }

      // Validate User Data (Prevent crash)
      if (!meRes || !meRes.data || !meRes.data.user) {
        throw new Error('Invalid user data received (empty body?)');
      }

      setUser(meRes.data.user);
      setRole(meRes.data.role || 'user');

      // 2. Fetch Projects (Non-Critical)
      try {
        const pRes = await api.get('/api/projects');
        const list = pRes.data.projects || [];
        setProjects(list);
        if (list.length && !list.includes(project)) setProject(list[0]);
      } catch (pErr) {
        console.warn('[App] Failed to load projects (non-fatal):', pErr);
        setProjects([]);
      }

      setIsAuthenticated(true);
      setBootStatus('ready');

    } catch (err) {
      console.error('[App] Auth Check Failed:', err);

      // If it's a 401, we consider it a hard failure -> Login
      if (err.response && err.response.status === 401) {
        resetAuthState(true);
      } else {
        // Other errors (Network, 304, 500) -> Show Error Screen with Retry
        setBootError(err.message || 'Failed to connect');
        setBootStatus('error');
        // Do NOT clear token yet, user might just need to retry
      }
    }
  }

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true); // Optimistic
    await checkAuth(); // Boot
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      resetAuthState(true);
    }
  };

  // Tabs Configuration
  const TABS = [
    { id: 'dashboard', label: t('sidebar.dashboard'), Component: DashboardNew },
    { id: 'reports_v2', label: 'Reports V2', Component: ReportsTab },
    { id: 'corev2', label: 'Core V2', Component: CoreV2Tab },
    { id: 'transactions', label: 'Transactions', Component: TransactionsTab },
    { id: 'config', label: t('sidebar.config'), Component: ConfigTab },
    { id: 'health', label: 'System Health', Component: SystemHealthTab },
    ...(ENABLE_LEGACY ? [
      { id: 'process', label: 'Process (V1)', Component: ProcessTab },
      { id: 'teacher', label: 'Teacher', Component: TeacherTab },
      { id: 'explore', label: 'Explore (Old)', Component: ExploreTab },
      { id: 'normalization', label: 'Normalization', Component: NormalizationTab },
      { id: 'audit', label: t('sidebar.audit'), Component: AuditTab },
    ] : [])
  ];

  // -- Render States --

  // 1. Loading
  if (bootStatus === 'loading') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-base)] text-[var(--text-muted)] gap-4">
        <div className="text-2xl animate-pulse">Invoice Studio</div>
        <div className="text-sm opacity-75">Loading Gravity...</div>
      </div>
    );
  }

  // 2. Error (Retry)
  if (bootStatus === 'error') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-base)] text-[var(--text-main)] gap-6">
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/10 max-w-md text-center">
          <h3 className="text-lg font-bold text-red-400 mb-2">Connection Issue</h3>
          <p className="text-sm opacity-80 mb-4">{bootError}</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => checkAuth(0)} className="btn primary">Retry</button>
            <button onClick={() => resetAuthState(true)} className="btn">Sign Out</button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Login
  if (!isAuthenticated && bootStatus !== 'ready') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // 4. Ready (App Shell) -> Proceed to existing render logic

  // Filter Tabs based on Role
  let visibleTabs = TABS.filter(t => !t.hidden);
  if (role !== 'admin') {
    visibleTabs = visibleTabs.filter(t => t.id !== 'config' && t.id !== 'health');
  }

  const CurrentComponent = visibleTabs.find(t => t.id === activeTab)?.Component || (() => <div className="p-10">Tab Not Found</div>);

  return (
    <AppShell
      tabs={visibleTabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
      role={role}
      onLogout={handleLogout}
      theme={theme}
      setTheme={setTheme}
      accent={accent}
      setAccent={setAccent}
      project={project}
      projects={projects}
      setProject={setProject}
    >
      <ErrorBoundary>
        <CurrentComponent project={project} />
      </ErrorBoundary>
    </AppShell>
  );
}
