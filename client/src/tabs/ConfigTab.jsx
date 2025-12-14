// client/src/tabs/ConfigTab.jsx
import React from 'react'
import { qp } from '../shared/ui'
import api from '../api/apiClient'

export default function ConfigTab({ project }) {
  const [key, setKey] = React.useState(localStorage.getItem('OPENAI_API_KEY') || '')
  const [logo, setLogo] = React.useState(null)

  // Tipos de documento
  const [items, setItems] = React.useState([])
  const [raw, setRaw] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  async function loadTypes() {
    try {
      const j = await api.get(qp('/api/config/doctypes', project)).then(r => r.data)
      const arr = Array.isArray(j) ? j : (j.items || [])
      setItems(arr)
      setRaw((arr || []).join('\n'))
    } catch {
      setItems([]); setRaw('')
    }
  }
  React.useEffect(() => { loadTypes() }, [project])

  function parseLines(txt) {
    return Array.from(new Set(
      String(txt || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
    ))
  }

  async function saveTypes() {
    const arr = parseLines(raw)
    if (!arr.length) { alert('Adiciona pelo menos um tipo.'); return }
    try {
      setBusy(true)
      await api.put(qp('/api/config/doctypes', project), { items: arr })
      await loadTypes()
      alert('Tipos de documento guardados ✓')
    } catch (e) {
      alert(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function uploadLogo() {
    if (!logo) return
    try {
      setBusy(true)
      await api.post(qp('/api/app-logo', project), { dataUrl: logo })
      alert('Logo atualizado ✓')
    } catch (e) {
      alert(e?.response?.data?.error || e.message)
    } finally {
      setBusy(false)
    }
  }

  /* --- Secrets (API Key) --- */
  async function loadSecrets() {
    try {
      const j = await api.get(qp('/api/config/secrets', project)).then(r => r.data);
      if (j.hasApiKey && j.maskedKey) setKey(j.maskedKey);
    } catch { }
  }
  async function saveKey() {
    if (!key.trim()) return;
    // se for a mascara, nao salvar de novo
    if (key.includes('...')) { alert('Chave já guardada (mascarada). Para alterar, escreve uma nova.'); return; }
    try {
      await api.post(qp('/api/config/secrets', project), { apiKey: key });
      localStorage.setItem('OPENAI_API_KEY', key); // manter sync local opcional
      await loadSecrets();
      alert('Chave guardada no servidor ✓');
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.error || e.message || 'Erro desconhecido'
      if (e?.response?.status === 404) alert('Erro 404: Endpoint não encontrado. Verifica se o servidor está atualizado.')
      else alert('Não foi possível guardar a chave: ' + msg)
    }
  }
  async function clearKey() {
    try {
      await api.post(qp('/api/config/secrets', project), { apiKey: '' });
      localStorage.removeItem('OPENAI_API_KEY');
      setKey('');
      alert('Chave removida.');
    } catch (e) { alert('Erro: ' + e.message); }
  }

  React.useEffect(() => { loadSecrets() }, [project]);

  return (
    <div className="card">
      <div className="card__title">Configurações</div>

      <div className="grid-2">
        <div>
          <div className="label">OpenAI API Key</div>
          <input className="input" placeholder="sk-..." value={key} onChange={e => setKey(e.target.value)} />
          <div className="row mt-8">
            <button className="btn primary" onClick={saveKey}>Guardar (Server)</button>
            <button className="btn" onClick={clearKey}>Limpar</button>
          </div>
          <div className="muted mt-8">Guardada em data/config/secrets.json.</div>
        </div>

        <div>
          <div className="label">Logo da aplicação (PNG)</div>
          <input
            type="file"
            accept="image/png"
            onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader(); r.onload = () => setLogo(r.result); r.readAsDataURL(f)
            }}
          />
          <div className="row mt-8">
            <button className="btn" disabled={!logo || busy} onClick={uploadLogo}>Guardar logo</button>
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card__title">Tipos de Documento</div>
        <div className="muted">Um por linha (ex.: Fatura, Encomenda, Proposta, Recibo, NotaCredito, Documento).</div>
        <textarea
          className="input mt-8"
          style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="Fatura&#10;Encomenda&#10;Proposta&#10;Recibo&#10;NotaCredito&#10;Documento"
        />
        <div className="row mt-12" style={{ gap: 8 }}>
          <div className="muted">Atuais: <b>{items.length}</b></div>
          <div style={{ justifySelf: 'end', display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={loadTypes}>Recarregar</button>
            <button className="btn primary" disabled={busy} onClick={saveTypes}>Guardar Tipos</button>
          </div>
        </div>
      </div>
    </div>
  )
}
