// client/src/shared/ui.jsx
import React from 'react'
import * as htmlToImage from 'html-to-image'
import api from '../api/apiClient'

export const THEMES = ['dark', 'light', 'ocean', 'solarized', 'light-high']
export const COLS = ['Fornecedor', 'Fatura', 'Data', 'Total', 'Cliente', 'Vencimento', 'Portes']
export const TEACHER_FIELDS = ['Fornecedor', 'Fatura', 'Data', 'Total', 'Cliente', 'Vencimento', 'Portes', 'IBAN', 'NIF', 'Morada', 'Outro']

export function Badge({ children }) { return <span className="badge">{children}</span> }
export function Tooltip({ children, content }) { return <span title={content}>{children}</span> }

export function fmtEUR(v) {
  const n = typeof v === 'number'
    ? v
    : (() => { let t = String(v ?? '').replace(/[€\s]/g, ''); if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes(',')) t = t.replace(',', '.'); return parseFloat(t) || 0; })()
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n)
}
export function fmtParty(p) {
  if (p == null) return ''
  if (typeof p === 'string') return p
  if (typeof p === 'object') {
    const name = (p.name || '').toString().trim()
    const vat = (p.vatNumber || p.nif || '').toString().trim()
    const addr = (p.address || '').toString().trim()
    if (name) return name
    const parts = [name, vat, addr].filter(Boolean)
    return parts.length ? parts.join(' - ') : JSON.stringify(p)
  }
  return String(p)
}
export function useETA() {
  const lastLoaded = React.useRef(0), lastTime = React.useRef(0)
  const [eta, setETA] = React.useState(null)
  const reset = () => { lastLoaded.current = 0; lastTime.current = Date.now(); setETA(null) }
  const onProgress = (loaded, total) => { const now = Date.now(), dt = (now - lastTime.current) / 1000, dB = loaded - lastLoaded.current; if (dt > 0 && dB >= 0) { const speed = dB / dt, rem = total - loaded; if (speed > 0) setETA(rem / speed) } lastLoaded.current = loaded; lastTime.current = now }
  return { eta, reset, onProgress }
}
export function Tabs({ tab, setTab }) {
  const tabs = ['Core (v2)', 'Processar', 'Explorar/Editar', 'Normalizações', 'Relatórios', 'Auditoria', 'Transações', 'Teacher', 'Config']
  return <div className="tabs">{tabs.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
}
export function Progress({ label, value = 0, eta = null }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="progress">
      <div className="progress__row">
        <div className="progress__label">{label}</div>
        <div className="progress__val">{pct}% {eta != null && <span className="muted"> • ETA ~{Math.ceil(eta)}s</span>}</div>
      </div>
      <div className="progress__bar"><div className="progress__bar__fill" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
export function CollapsibleCard({ title, children, footer, initialOpen = true, exportNodeRef, exportName }) {
  const [open, setOpen] = React.useState(initialOpen)
  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
        <button className="chev" onClick={() => setOpen(o => !o)} title={open ? 'Encolher' : 'Expandir'}>{open ? '▾' : '▸'}</button>
        <div className="card__title" style={{ margin: 0 }}>{title}</div>
        {exportNodeRef && <button className="btn btn--tiny" onClick={() => saveNodeAsPng(exportNodeRef.current, exportName || title)}>[PNG]</button>}
      </div>
      {open && children}
      {open && footer}
    </div>
  )
}
export async function saveNodeAsPng(node, name) {
  if (!node) return alert('Sem dados para exportar.')
  const hasBars = node.querySelector('.bar')
  if (!hasBars) return alert('Sem dados para exportar.')
  const dataUrl = await htmlToImage.toPng(node, { pixelRatio: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0e1b1f' })
  const a = document.createElement('a'); a.href = dataUrl; a.download = `${name}.png`; a.click()
}
export function qp(url, project) {
  const u = new URL(url, window.location.origin)
  if (project) u.searchParams.set('project', project)
  return u.pathname + u.search
}

// Ícones
export const IconEdit = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm3.92 2.33H5v-1.92L14.06 6.52l1.92 1.92L6.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>)
export const IconEye = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7-11 7-11 7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></svg>)
export const IconTrash = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z" /></svg>)
export const IconClose = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.41 6.3 6.29-6.3 6.3 1.4 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.29z" /></svg>)
export const IconZoomIn = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm1-7h-2v2H6v2h2v2h2v-2h2V9h-2V7z" /></svg>)
export const IconZoomOut = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM7 9h5v2H7z" /></svg>)
export const IconDownload = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z" /></svg>)
export const IconExternal = (p) => (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}><path fill="currentColor" d="M19 3h-6v2h3.59L8 13.59 9.41 15 18 6.41V10h2V3zM5 5h6V3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-6h-2v6H5V5z" /></svg>)

export function mapDocToLegacyRow(d) {
  return {
    id: d.id,
    Fornecedor: fmtParty(d.supplier || ''),
    Fatura: d.docNumber || d.invoice || '',
    Tipo: d.docType || '',
    Data: d.date || '',
    Total: d.total || 0,
    Cliente: fmtParty(d.customer || ''),
    Vencimento: d.dueDate || '',
  }
}

// Helper para downloads com Auth (Bearer token)
export async function downloadFile(url, filename, body = {}, method = 'POST') {
  try {
    const res = await api.request({
      url,
      method,
      data: body,
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: res.headers['content-type'] });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    if (e.response && e.response.data instanceof Blob) {
      try {
        const text = await e.response.data.text();
        const json = JSON.parse(text);
        alert('Erro no download: ' + (json.error || 'Desconhecido'));
      } catch { alert('Erro no download: ' + e.message); }
    } else {
      alert('Erro no download: ' + (e.response?.data?.error || e.message));
    }
  }
}
// export { axios } removed
