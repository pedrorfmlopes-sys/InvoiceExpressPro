// client/src/tabs/ConfigTab.jsx
import React from 'react'
import { qp } from '../shared/ui'
import api from '../api/apiClient'
import { LanguageSelector } from '../components/LanguageSelector'
import { useTranslation } from 'react-i18next'
import UIConfigPanel from './UIConfigPanel'

export default function ConfigTab({ project }) {
  const { t } = useTranslation();
  const [key, setKey] = React.useState(localStorage.getItem('OPENAI_API_KEY') || '')
  const [logo, setLogo] = React.useState(null)

  // Tipos de documento
  const [items, setItems] = React.useState([])
  const [raw, setRaw] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [retentionDays, setRetentionDays] = React.useState(30)

  async function loadSettings() {
    try {
      const s = await api.get(qp('/api/config/settings', project)).then(r => r.data)
      if (s.backupRetentionDays) setRetentionDays(s.backupRetentionDays)
    } catch { }
  }

  React.useEffect(() => { loadSettings() }, [project])

  async function saveSettings() {
    try {
      setBusy(true)
      await api.post(qp('/api/config/settings', project), { backupRetentionDays: parseInt(retentionDays) })
      alert('Configurações guardadas ✓')
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

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

      {/* 3. Backup / History Config */}
      <div className="glass-panel">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🕰️</span>
          <h3 className="font-bold text-lg">Histórico de Edição</h3>
        </div>
        <div className="flex flex-col gap-2 max-w-md">
          <div className="label font-medium">Dias de Retenção de Rascunhos</div>
          <div className="text-sm text-[var(--text-muted)] mb-2">
            Os backups automáticos de rascunhos com mais de X dias serão eliminados automaticamente.
          </div>
          <div className="flex gap-4 items-center">
            <input
              type="number"
              className="input w-32"
              value={retentionDays}
              onChange={e => setRetentionDays(e.target.value)}
              min={1}
              max={365}
            />
            <span className="text-sm">dias</span>
            <button className="btn primary" onClick={saveSettings} disabled={busy}>
              Guardar
            </button>
          </div>
        </div>
      </div>

      {/* 2.5 UI Config */}
      <UIConfigPanel project={project} />

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

      {/* 4. Danger Zone */}
      <div className="glass-panel border-red-200 dark:border-red-900/30">
        <div className="flex items-center gap-2 mb-4 text-red-600 dark:text-red-400">
          <span className="text-xl">⚠️</span>
          <h3 className="font-bold text-lg">Zona de Perigo</h3>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/10 rounded border border-red-100 dark:border-red-900/20">
            <div>
              <div className="font-bold text-red-700 dark:text-red-400">Apagar Dados do Projeto</div>
              <div className="text-sm text-red-600/70 dark:text-red-400/70">Remove todos os documentos, transações e links. Mantém as configurações.</div>
            </div>
            <button
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded font-medium text-sm transition-colors"
              onClick={async () => {
                if (!confirm("Tem a certeza que quer APAGAR TODOS OS DADOS (Faturas, Transações) deste projeto?\n\nEsta ação é irreversível.")) return;
                try {
                  setBusy(true);
                  await api.delete(qp('/api/config/reset-data', project));
                  alert('Dados apagados com sucesso.');
                } catch (e) { alert(e.message || String(e)); } finally { setBusy(false); }
              }}
              disabled={busy}
            >
              Apagar Dados
            </button>
          </div>

          <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/10 rounded border border-red-100 dark:border-red-900/20">
            <div>
              <div className="font-bold text-red-700 dark:text-red-400">Eliminar Projeto</div>
              <div className="text-sm text-red-600/70 dark:text-red-400/70">Apaga permanentemente o projeto e todos os seus ficheiros.</div>
            </div>
            <button
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm transition-colors shadow-sm"
              onClick={async () => {
                if (!confirm("Tem a certeza que quer ELIMINAR ESTE PROJETO COMPLETAMENTE?\n\nIsto irá apagar configurações, dados e ficheiros.")) return;
                const name = prompt(`Para confirmar, escreva o nome do projeto: ${project}`);
                if (name !== project) { alert('Nome incorreto. Cancelado.'); return; }

                try {
                  setBusy(true);
                  await api.delete(qp('/api/config/project', project));
                  alert('Projeto eliminado.');
                  window.location.reload();
                } catch (e) { alert(e.message || String(e)); } finally { setBusy(false); }
              }}
              disabled={busy}
            >
              Eliminar Projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
