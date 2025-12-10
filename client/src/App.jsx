// client/src/App.jsx
import React, { useEffect, useState } from 'react'
import './styles.css'

import { THEMES, Tabs, qp } from './shared/ui'
import ProcessTab from './tabs/ProcessTab'
import ExploreTab from './tabs/ExploreTab'
import NormalizationTab from './tabs/NormalizationTab'
import ReportsTab from './tabs/ReportsTab'
import AuditTab from './tabs/AuditTab'
import TeacherTab from './tabs/TeacherTab'
import ConfigTab from './tabs/ConfigTab'

export default function App(){
  const [tab,setTab]=useState('Relatórios')
  const [theme,setTheme]=useState(localStorage.getItem('theme')||'ocean')
  const [project,setProject]=useState(localStorage.getItem('project')||'default')

  useEffect(()=>{ if(!THEMES.includes(theme)) setTheme('ocean'); document.documentElement.dataset.theme=theme; localStorage.setItem('theme',theme) },[theme])
  useEffect(()=>{ localStorage.setItem('project', project) }, [project])

  return (
    <div className="container">
      <header className="header">
        <h1>Invoice Studio</h1>
        <div className="header__right" style={{gap:8, display:'flex', alignItems:'center'}}>
          <ProjectBar project={project} onChange={setProject}/>
          <select className="input" style={{width:180}} value={theme} onChange={e=>setTheme(e.target.value)} title="Tema">
            {THEMES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <a href={qp('/api/export.xlsx', project)} className="btn">Descarregar Excel</a>
        </div>
      </header>
      <Tabs tab={tab} setTab={setTab}/>
      {tab==='Processar'       && <ProcessTab project={project}/>}
      {tab==='Explorar/Editar' && <ExploreTab project={project}/>}
      {tab==='Normalizações'   && <NormalizationTab project={project}/>}
      {tab==='Relatórios'      && <ReportsTab project={project}/>}
      {tab==='Auditoria'       && <AuditTab project={project}/>}
      {tab==='Teacher'         && <TeacherTab project={project}/>}
      {tab==='Config'          && <ConfigTab project={project}/>}
    </div>
  )
}

function ProjectBar({ project, onChange }){
  const [list, setList] = React.useState([])
  const [name, setName] = React.useState('')

  async function load(){
    try{
      const j = await fetch('/api/projects').then(r=>r.json())
      setList(j.projects || [])
      if(j.projects?.length && !j.projects.includes(project)) onChange(j.projects[0])
    }catch{}
  }
  React.useEffect(()=>{ load() }, [])

  async function create(){
    const p = name.trim()
    if(!p) return
    await fetch('/api/projects',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:p }) })
    setName(''); await load(); onChange(p)
  }
  async function del(){
    if(project==='default') return
    if(!confirm(`Apagar projeto "${project}"?`)) return
    await fetch(`/api/projects/${encodeURIComponent(project)}`, { method:'DELETE' })
    await load(); onChange('default')
  }

  return (
    <div className="row" style={{gap:8}}>
      <span className="muted">Projeto</span>
      <select className="input" value={project} onChange={e=>onChange(e.target.value)}>
        {list.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      <input className="input" placeholder="novo projeto" value={name} onChange={e=>setName(e.target.value)} style={{width:160}}/>
      <button className="btn" onClick={create} disabled={!name.trim()}>Criar</button>
      <button className="btn" onClick={del} disabled={project==='default'}>Apagar</button>
    </div>
  )
}
