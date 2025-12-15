// client/src/tabs/AuditTab.jsx
import React from 'react'
import { qp } from '../shared/ui'
import api from '../api/apiClient'

export default function AuditTab({ project }) {
  const [invoice, setInvoice] = React.useState(''); const [entries, setEntries] = React.useState([])
  async function load() {
    const q = invoice ? `?invoice=${encodeURIComponent(invoice)}` : '';
    const url = qp(`/api/audit${q}`, project)
    const j = await api.get(url).then(r => r.data).catch(() => [])
    setEntries(Array.isArray(j) ? j : (j.entries || []))
  }
  React.useEffect(() => { load(); const onR = () => load(); window.addEventListener('reports-refresh', onR); return () => window.removeEventListener('reports-refresh', onR) }, [project])
  return (
    <div className="card overflow">
      <div className="card__title">Audit Log</div>
      <div className="row"><input className="input" placeholder="Filtrar por Nº fatura (opcional)" value={invoice} onChange={e => setInvoice(e.target.value)} /><button className="btn" onClick={load}>Atualizar</button></div>
      <table className="table mt-16">
        <thead><tr><th>Quando</th><th>Ação</th><th>Fatura</th><th>Ator</th><th>Detalhes</th></tr></thead>
        <tbody>{entries.map((e, i) => (
          <tr key={i}><td>{e.ts}</td><td>{e.action}</td><td>{e.invoice}</td><td>{e.actor || 'ui'}</td><td><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ fromKey: e.fromKey, toKey: e.toKey, mode: e.mode, before: e.before, after: e.after, details: e.details }, null, 2)}</pre></td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}
