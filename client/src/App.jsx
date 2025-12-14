// client/src/App.jsx
import React, { useEffect, useState } from 'react'
import './styles.css'

import { THEMES, Tabs, qp } from './shared/ui'
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
  const [tab, setTab] = useState('Relatórios')
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'ocean')
  const [project, setProject] = useState(localStorage.getItem('project') || 'default')

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setOnAuthFailure(() => setIsAuthenticated(false));

    // Initial check: if we have a token or not, check if API allows access
    // This handles AUTH_MODE=required vs optional
    checkAuth();
  }, [])

  async function checkAuth() {
    try {
      await api.get('/api/projects');
      setIsAuthenticated(true);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        setIsAuthenticated(false);
      } else {
        // Other errors (e.g. network), assume OK or let user try? 
        // If offline, maybe keep current state.
        // But if we truly required auth, we would get 401. 
        // If we are in optional mode and no token, we get 200.
        if (localStorage.getItem('token')) setIsAuthenticated(true); // Trust token if network err?
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!THEMES.includes(theme)) setTheme('ocean'); document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('project', project) }, [project])

  const handleDownload = async (e) => {
    e.preventDefault();
    try {
      const data = await downloadFile('/api/export.xlsx', { project });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `export_${project}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Download falhou');
    }
  };

  if (loading) return <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Carregando...</div>;

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => { setIsAuthenticated(true); checkAuth(); }} />;
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Invoice Studio</h1>
        <div className="header__right" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
          <ProjectBar project={project} onChange={setProject} />
          <select className="input" style={{ width: 180 }} value={theme} onChange={e => setTheme(e.target.value)} title="Tema">
            {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn" onClick={handleDownload}>Descarregar Excel</button>
          <button className="btn" onClick={() => { logout(); setIsAuthenticated(false); }} title="Sair">Sair</button>
        </div>
      </header>
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'Core (v2)' && <CoreV2Tab project={project} />}
      {tab === 'Processar' && <ProcessTab project={project} />}
      {tab === 'Explorar/Editar' && <ExploreTab project={project} />}
      {tab === 'Normalizações' && <NormalizationTab project={project} />}
      {tab === 'Relatórios' && <ReportsTab project={project} />}
      {tab === 'Auditoria' && <AuditTab project={project} />}
      {tab === 'Transações' && <TransactionsTab project={project} />}
      {tab === 'Teacher' && <TeacherTab project={project} />}
      {tab === 'Config' && <ConfigTab project={project} />}
    </div>
  )
}

function ProjectBar({ project, onChange }) {
  const [list, setList] = React.useState([])
  const [name, setName] = React.useState('')

  async function load() {
    try {
      const res = await api.get('/api/projects')
      const j = res.data;
      setList(j.projects || [])
      if (j.projects?.length && !j.projects.includes(project)) onChange(j.projects[0])
    } catch { }
  }
  React.useEffect(() => { load() }, [])

  async function create() {
    const p = name.trim()
    if (!p) return
    await api.post('/api/projects', { name: p })
    setName(''); await load(); onChange(p)
  }
  async function del() {
    if (project === 'default') return
    if (!confirm(`Apagar projeto "${project}"?`)) return
    await api.delete(`/api/projects/${encodeURIComponent(project)}`)
    await load(); onChange('default')
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="muted">Projeto</span>
      <select className="input" value={project} onChange={e => onChange(e.target.value)}>
        {list.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <input className="input" placeholder="novo projeto" value={name} onChange={e => setName(e.target.value)} style={{ width: 160 }} />
      <button className="btn" onClick={create} disabled={!name.trim()}>Criar</button>
      <button className="btn" onClick={del} disabled={project === 'default'}>Apagar</button>
    </div>
  )
}
