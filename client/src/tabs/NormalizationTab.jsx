// client/src/tabs/NormalizationTab.jsx
import React from 'react'
import { qp } from '../shared/ui'
import api from '../api/apiClient'

export default function NormalizationTab({ project }) {
  const [data, setData] = React.useState({ suppliers: {}, customers: {} })
  const [type, setType] = React.useState('suppliers')
  const [alias, setAlias] = React.useState('')
  const [canonical, setCanonical] = React.useState('')
  async function load() {
    const j = await api.get(qp('/api/normalize', project)).then(r => r.data).catch(() => ({}))
    setData(j || { suppliers: {}, customers: {} })
  }
  React.useEffect(() => { load(); const onR = () => load(); window.addEventListener('reports-refresh', onR); return () => window.removeEventListener('reports-refresh', onR) }, [project])
  async function add() { if (!alias.trim() || !canonical.trim()) return; await api.post(qp('/api/normalize', project), { type, alias, canonical }); setAlias(''); setCanonical(''); load() }
  async function delRow(t, a) { if (!confirm(`Apagar regra: ${a}?`)) return; await api.delete(qp('/api/normalize', project), { data: { type: t, alias: a } }); load() }
  return (
    <>
      <div className="card">
        <div className="card__title">Adicionar normalização</div>
        <div className="row">
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="suppliers">Fornecedor</option>
            <option value="customers">Cliente</option>
          </select>
          <input className="input" placeholder="Alias" value={alias} onChange={e => setAlias(e.target.value)} />
          <input className="input" placeholder="Nome canónico" value={canonical} onChange={e => setCanonical(e.target.value)} />
          <button className="btn primary" onClick={add}>Guardar</button>
        </div>
      </div>

      <div className="card mt-16 overflow">
        <div className="card__title">Regras existentes</div>
        <table className="table">
          <thead><tr><th>Tipo</th><th>Alias</th><th>Canónico</th><th>Ações</th></tr></thead>
          <tbody>
            {Object.entries(data).flatMap(([t, map]) => Object.entries(map).map(([k, v]) => (
              <tr key={`${t}:${k}`}>
                <td>{t === 'suppliers' ? 'Fornecedor' : 'Cliente'}</td>
                <td>{k}</td>
                <td>{v}</td>
                <td className="row"><button className="btn" onClick={() => delRow(t, k)}>Apagar</button></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </>
  )
}
