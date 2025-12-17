// client/src/tabs/ConfigTab.jsx
import React from 'react'
import { qp } from '../shared/ui'
import api from '../api/apiClient'
import { LanguageSelector } from '../components/LanguageSelector'
import { useTranslation } from 'react-i18next'

export default function ConfigTab({ project }) {
  const { t } = useTranslation();
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
    <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar">

      {/* 1. Regional & Interface */}
      <div className="glass-panel">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">🌍</span>
          <h3 className="font-bold text-lg">{t('config.regional')}</h3>
        </div>
        <LanguageSelector />
      </div>

      {/* 2. System Configs */}
      <div className="glass-panel">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">⚙️</span>
          <h3 className="font-bold text-lg">{t('config.title')}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="label mb-2 font-medium">{t('config.apikey')}</div>
            <input className="input" placeholder="sk-..." value={key} onChange={e => setKey(e.target.value)} />
            <div className="flex gap-4 mt-4">
              <button className="btn primary" onClick={saveKey}>{t('config.save')}</button>
              <button className="btn" onClick={clearKey}>{t('config.clear')}</button>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2">Guardada em data/config/secrets.json.</div>
          </div>

          <div>
            <div className="label mb-2 font-medium">{t('config.logo')}</div>
            <input
              type="file"
              accept="image/png"
              className="mb-4 text-sm"
              onChange={e => {
                const f = e.target.files?.[0]; if (!f) return
                const r = new FileReader(); r.onload = () => setLogo(r.result); r.readAsDataURL(f)
              }}
            />
            <div className="row">
              <button className="btn" disabled={!logo || busy} onClick={uploadLogo}>{t('config.save')}</button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Doc Types */}
      <div className="glass-panel">
        <div className="card__title mb-4">{t('config.doctypes')}</div>
        <div className="text-sm text-[var(--text-muted)] mb-4">Um por linha (ex.: Fatura, Encomenda, Proposta, Recibo, NotaCredito, Documento).</div>
        <textarea
          className="input w-full p-4 font-mono text-sm bg-[var(--bg-base)]"
          style={{ minHeight: 160 }}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="Fatura&#10;Encomenda&#10;Proposta&#10;Recibo&#10;NotaCredito&#10;Documento"
        />
        <div className="flex items-center justify-between mt-4" style={{ gap: 8 }}>
          <div className="text-xs opacity-50">Atuais: <b>{items.length}</b></div>
          <div className="flex gap-4">
            <button className="btn" disabled={busy} onClick={loadTypes}>{t('config.reload')}</button>
            <button className="btn primary" disabled={busy} onClick={saveTypes}>{t('config.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
