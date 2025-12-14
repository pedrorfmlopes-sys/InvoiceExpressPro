// client/src/tabs/ProcessTab.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/apiClient'
import { THEMES, Tabs, qp, fmtEUR, useETA, Progress, IconEye, IconTrash, IconClose } from '../shared/ui'
import Toast from '../components/Toast'

/* ---------- helpers locais ---------- */






/* ---------- viewer ---------- */
function PdfViewerOverlay({ open, url, onClose }) {
  const [zoom, setZoom] = useState(1)
  useEffect(() => { if (!open) setZoom(1) }, [open])
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    if (open) { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="viewer__backdrop" onClick={onClose}>
      <div className="viewer__card" onClick={e => e.stopPropagation()}>
        <div className="viewer__toolbar">
          <button className="btn btn--icon" onClick={onClose}><IconClose /></button>
          <div style={{ fontWeight: 600 }}>Visualizar</div>
          <div />
        </div>
        <div className="viewer__body">
          <div className="viewer__scaler" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <iframe className="viewer__frame" src={url} title="Documento" />
          </div>
          <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6 }}>
            <button className="btn btn--icon" title="-" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}>–</button>
            <div className="btn btn--icon" style={{ pointerEvents: 'none' }}>{Math.round(zoom * 100)}%</div>
            <button className="btn btn--icon" title="+" onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- componente principal ---------- */
export default function ProcessTab({ project }) {
  const [files, setFiles] = useState([])
  const [isDragging, setDrag] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [procPct, setProcPct] = useState(0)
  const [currentExcelPath, setCurrentExcelPath] = useState('')
  const [outputMode, setOutputMode] = useState('download')
  const [excelDir, setExcelDir] = useState('')
  const [excelFilename, setExcelFilename] = useState('invoices.xlsx')
  const [dirList, setDirList] = useState([])
  const [newDirName, setNewDirName] = useState('')
  const [doctypes, setDoctypes] = useState([])

  const [batchId, setBatchId] = useState('')
  const [secretsPresent, setSecretsPresent] = useState(false)
  const [batchRows, setBatchRows] = useState([])          // só este lote
  const [selected, setSelected] = useState(new Set())     // ids selecionados
  const [edits, setEdits] = useState({})                  // id -> campos editados
  const [viewer, setViewer] = useState({ open: false, url: '' })
  const [toast, setToast] = useState({ open: false, text: '' })

  const pollRef = useRef(null)
  const { eta: etaUpload, reset: resetUL, onProgress: onUL } = useETA()
  const apiKey = localStorage.getItem('OPENAI_API_KEY') || ''

  useEffect(() => {
    refreshDirs()
    fetch(qp('/api/health', project)).then(r => r.json()).then(j => setCurrentExcelPath(j.excelOutputPath || ''))
    fetch(qp('/api/config/doctypes', project)).then(r => r.json()).then(j => setDoctypes(j.items || []))
    fetch(qp('/api/config/secrets', project)).then(r => r.json()).then(j => setSecretsPresent(!!j.openaiApiKeyPresent))
  }, [project])

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  async function refreshDirs() {
    const j = await fetch(qp('/api/dirs', project)).then(r => r.json()).catch(() => ({}))
    const entries = j.entries || []
    setDirList(entries)
    if (entries.length && !entries.includes(excelDir)) setExcelDir(entries[0])
    setCurrentExcelPath(j.excelOutputPath || j.projectBase || '')
  }
  async function createDir() {
    if (!newDirName.trim()) return
    const { data } = await api.post(qp('/api/mkdir', project), { dir: newDirName.trim() }, { headers: { 'Content-Type': 'application/json' } })
    if (data?.ok) { setNewDirName(''); refreshDirs(); setExcelDir(newDirName.trim()) }
  }

  function pollProgress(_batchId, total) {
    if (pollRef.current) clearInterval(pollRef.current)

    // Polling fn
    pollRef.current = setInterval(async () => {
      let isDone = false;
      let shouldStop = false;

      // 1. Check Progress
      try {
        const u = `/api/progress/${encodeURIComponent(_batchId)}?project=${encodeURIComponent(project)}`;
        const res = await fetch(u);

        if (res.status === 404) {
          // Batch perdida/inexistente -> Abortar
          clearInterval(pollRef.current); pollRef.current = null;
          setLoading(false);
          setToast({ open: true, text: 'Batch não encontrada (progress 404).' });
          return;
        }

        if (res.ok) {
          const j = await res.json();
          if (j.status === 'finished' || (j.done && j.done >= (j.total || total || 1))) {
            isDone = true;
            setProcPct(100);
          } else {
            // Update progress bar
            const d = j.done || 0; const e = j.errors || 0; const t = j.total || total || 1;
            setProcPct(Math.min(100, ((d + e) / t) * 100));
          }
        }
      } catch (e) {
        // Network error? Ignore skip tick
      }

      if (isDone) {
        shouldStop = true;
        // One-time fetch batch data
        try {
          const resB = await fetch(qp(`/api/batch/${encodeURIComponent(_batchId)}`, project));
          if (resB.ok) {
            const b = await resB.json();
            const rows = b.rows || [];
            if (rows.length) {
              setBatchRows(rows);
              // Initialize edits
              setEdits(prev => {
                const np = { ...prev };
                for (const r of rows) {
                  if (!np[r.id]) {
                    np[r.id] = {
                      docType: r.docType || '',
                      docNumber: r.docNumber || '',
                      date: r.date || '',
                      dueDate: r.dueDate || '',
                      supplier: r.supplier || '',
                      customer: r.customer || '',
                      total: r.total || 0
                    };
                  }
                }
                return np;
              });
            }
          } else if (resB.status === 404) {
            setToast({ open: true, text: 'Batch finalizada, mas dados não encontrados (404).' });
          }
        } catch (e) { /* ignore */ }
      }

      if (shouldStop) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLoading(false);
      }
    }, 1000); // 1s interval
  }

  async function run() {
    try {
      setLoading(true); setUploadPct(0); setProcPct(0); resetUL(); setBatchRows([]); setSelected(new Set()); setEdits({})
      if (outputMode === 'append') {
        await api.post(qp('/api/set-output', project), { dir: excelDir, name: excelFilename }, { headers: { 'Content-Type': 'application/json' } })
        const j = await fetch(qp('/api/health', project)).then(r => r.json()); setCurrentExcelPath(j.excelOutputPath || '')
      }
      const fd = new FormData(); files.forEach(f => fd.append('files', f))
      const newBatch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      setBatchId(newBatch)
      pollProgress(newBatch, files.length)
      await api.post(qp(`/api/extract?batchId=${encodeURIComponent(newBatch)}`, project), fd, {
        timeout: 0, maxBodyLength: Infinity, maxContentLength: Infinity,
        headers: apiKey ? { 'X-OpenAI-Key': apiKey } : undefined,
        onUploadProgress: (e) => { if (!e.total) return; setUploadPct(Math.min(100, (e.loaded / e.total) * 100)); onUL(e.loaded, e.total) }
      })
      // não forçar 100% aqui; deixar o poll fechar sozinho
    } catch (e) { setToast({ open: true, text: 'Erro: ' + (e?.response?.data?.error || e.message) }) }
    finally {
      // o polling fecha-se quando done+errors >= total
    }
  }

  /* ---------- seleção ---------- */
  function toggleAll(e) {
    const on = e.target.checked
    setSelected(on ? new Set(batchRows.map(r => r.id)) : new Set())
  }
  function toggleOne(id, on) {
    setSelected(prev => { const s = new Set(prev); on ? s.add(id) : s.delete(id); return s })
  }

  /* ---------- edição ---------- */
  function setEdit(id, key, val) {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }))
  }

  /* ---------- ações por linha ---------- */
  function openViewer(id) { setViewer({ open: true, url: qp(`/api/doc/view?id=${encodeURIComponent(id)}`, project) }) }
  async function deleteOne(id) {
    if (!confirm('Apagar este registo? O PDF será removido.')) return
    await api.delete(qp(`/api/doc/${encodeURIComponent(id)}`, project))
    if (batchId) {
      try {
        const b = await fetch(qp(`/api/batch/${encodeURIComponent(batchId)}`, project)).then(r => r.json())
        setBatchRows(b.rows || [])
      } catch {
        setBatchRows(prev => prev.filter(r => r.id !== id))
      }
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  /* ---------- validação ---------- */
  const rowHasErrors = (e) => {
    if (!e) return true
    const t = (e.docType || '').toString().trim()
    const n = (e.docNumber || '').toString().trim()
    return !t || !n
  }

  const canConfirm = useMemo(() => {
    if (!selected.size) return false
    for (const r of batchRows) {
      if (!selected.has(r.id)) continue
      if (rowHasErrors(edits[r.id])) return false
    }
    return true
  }, [selected, batchRows, edits])

  /* ---------- confirmar selecionados ---------- */
  async function confirmSelected() {
    if (!selected.size) return
    // guarda alterações
    const patchPromises = []
    for (const r of batchRows) {
      if (!selected.has(r.id)) continue
      const e = edits[r.id] || {}
      if (rowHasErrors(e)) { setToast({ open: true, text: 'Preenche o Tipo e o Nº da fatura para todas as linhas selecionadas.' }); return }
      const diff = {}
      if (e.docType !== r.docType) diff.docType = e.docType
      if (e.docNumber !== r.docNumber) diff.docNumber = e.docNumber
      if (e.date !== r.date) diff.date = e.date
      if (e.dueDate !== r.dueDate) diff.dueDate = e.dueDate
      if (String(e.supplier || '') !== String(r.supplier || '')) diff.supplier = e.supplier
      if (String(e.customer || '') !== String(r.customer || '')) diff.customer = e.customer
      if (Number(e.total || 0) !== Number(r.total || 0)) diff.total = Number(e.total || 0)
      if (Object.keys(diff).length) {
        patchPromises.push(axios.patch(qp(`/api/doc/${encodeURIComponent(r.id)}`, project), diff, { headers: { 'X-Actor': 'process-bulk' } }))
      }
    }
    try {
      await Promise.all(patchPromises)
      // finalize-bulk
      const items = []
      for (const r of batchRows) {
        if (!selected.has(r.id)) continue
        const e = edits[r.id]
        items.push({ id: r.id, docType: e.docType, docNumber: e.docNumber })
      }
      const { data } = await api.post(qp('/api/docs/finalize-bulk', project), { items })
      const failed = (data?.results || []).filter(x => !x.ok)
      if (failed.length) {
        setToast({ open: true, text: 'Alguns itens falharam. Verifique o log.' })
      } else {
        setToast({ open: true, text: 'Confirmado ✓' })
      }
      // refresh
      if (batchId) {
        try {
          const b = await fetch(qp(`/api/batch/${encodeURIComponent(batchId)}`, project)).then(r => r.json())
          setBatchRows(b.rows || [])
        } catch {
          // sem endpoint, limpa tudo do lote atual
          setBatchRows([])
        }
      }
      setSelected(new Set())
      window.dispatchEvent(new CustomEvent('reports-refresh'))
      window.dispatchEvent(new CustomEvent('reports-refresh'))
    } catch (e) {
      setToast({ open: true, text: 'Erro: ' + (e?.response?.data?.error || e.message) })
    }
  }

  return (
    <>
      <div className="card">
        <div className="card__title">Local de saída <span className="badge">{currentExcelPath || '-'}</span></div>
        <div className="row mt-8">
          <label className="radio"><input type="radio" checked={outputMode === 'download'} onChange={() => setOutputMode('download')} /> <span>Download único</span></label>
          <label className="radio"><input type="radio" checked={outputMode === 'append'} onChange={() => setOutputMode('append')} /> <span>Guardar/atualizar no mesmo ficheiro</span></label>
        </div>
        {outputMode === 'append' && (
          <div className="grid-2 mt-12">
            <div>
              <div className="label">Pasta (no projeto)</div>
              <div className="row">
                <select className="input" value={excelDir} onChange={e => setExcelDir(e.target.value)}>
                  {(dirList || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button className="btn" onClick={refreshDirs}>Atualizar</button>
              </div>
              <div className="row mt-8">
                <input className="input" placeholder="nova-pasta (opcional)" value={newDirName} onChange={e => setNewDirName(e.target.value)} />
                <button className="btn" onClick={createDir}>Criar</button>
              </div>
            </div>
            <div>
              <div className="label">Nome do ficheiro</div>
              <input className="input" value={excelFilename} onChange={e => setExcelFilename(e.target.value)} placeholder="invoices.xlsx" />
            </div>
          </div>
        )}
        <div className="muted mt-8">
          {secretsPresent ? <span style={{ color: 'var(--success)' }}>✓ OpenAI configurado</span> : <span>IA opcional: define a OpenAI API Key em <b>Config</b> para extração inteligente.</span>}
          Projeto atual: <b>{project}</b>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card__title">Carregar PDFs</div>
        <div className={`dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={e => { e.preventDefault(); setDrag(false) }}
          onDrop={e => { e.preventDefault(); setDrag(false); const dropped = Array.from(e.dataTransfer.files || []).filter(f => /\.pdf$/i.test(f.name)); setFiles(prev => [...prev, ...dropped]) }}>
          <div className="dropzone__title">Arraste os PDFs para aqui</div>
          <div className="muted">ou</div>
          <input className="input mt-8" type="file" accept="application/pdf" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
          <div className="muted mt-8">{files.length} ficheiro(s) selecionado(s)</div>
        </div>

        <button className="btn primary mt-12" disabled={!files.length || loading} onClick={run}>
          {loading ? <><span className="spinner" /> A processar...</> : `Processar ${files.length || ''} PDFs`}
        </button>
        {loading && (
          <div className="mt-12">
            <Progress label="Upload" value={uploadPct} eta={etaUpload} />
            <Progress label="Processamento" value={procPct} />
          </div>
        )}
      </div >

      {!!batchRows.length && (
        <div className="card mt-16 overflow">
          <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <div className="card__title" style={{ margin: 0 }}>Revisão do lote atual</div>
            <div style={{ display: 'flex', gap: 8, justifySelf: 'end' }}>
              <button className="btn primary" disabled={!canConfirm} onClick={confirmSelected}>Confirmar selecionados</button>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    onChange={toggleAll}
                    checked={batchRows.length > 0 && selected.size === batchRows.length}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th></th>
                <th>Tipo</th>
                <th>Fatura</th>
                <th>Data</th>
                <th>Total (€)</th>
                <th>Cliente</th>
                <th>Vencimento</th>
                <th>Fornecedor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {batchRows.map(r => {
                const e = edits[r.id] || {}
                const hasErr = rowHasErrors(e)
                const rowStyle = (selected.has(r.id) && hasErr)
                  ? { background: 'color-mix(in oklab, var(--err) 12%, transparent)' }
                  : {}
                return (
                  <tr key={r.id} style={rowStyle}>
                    <td><input type="checkbox" checked={selected.has(r.id)} onChange={ev => toggleOne(r.id, ev.target.checked)} aria-label="Selecionar" /></td>
                    <td><button className="iconbtn" title="Ver" onClick={() => openViewer(r.id)}><IconEye /></button></td>
                    <td>
                      <select className={`input input--tight ${!e.docType ? 'input--warn' : ''}`} value={e.docType || ''} onChange={ev => setEdit(r.id, 'docType', ev.target.value)}>
                        <option value="">— escolher —</option>
                        {doctypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td><input className={`input input--tight ${!e.docNumber ? 'input--warn' : ''}`} value={e.docNumber || ''} onChange={ev => setEdit(r.id, 'docNumber', ev.target.value)} placeholder="Nº doc" /></td>
                    <td><input className="input input--tight" type="date" value={e.date || ''} onChange={ev => setEdit(r.id, 'date', ev.target.value)} /></td>
                    <td><input className="input input--tight" value={String(e.total ?? 0)} onChange={ev => setEdit(r.id, 'total', ev.target.value)} /></td>
                    <td><input className="input input--tight" value={e.customer || ''} onChange={ev => setEdit(r.id, 'customer', ev.target.value)} /></td>
                    <td><input className="input input--tight" type="date" value={e.dueDate || ''} onChange={ev => setEdit(r.id, 'dueDate', ev.target.value)} /></td>
                    <td>
                      <input className="input input--tight" value={e.supplier || ''} onChange={ev => setEdit(r.id, 'supplier', ev.target.value)} />
                      {r.extractionMethod === 'ai' && <span className="badge" style={{ background: 'var(--success)', color: '#fff', transform: 'scale(0.8)', marginLeft: 4 }}>AI</span>}
                      {r.extractionMethod === 'regex' && <span className="badge" style={{ background: 'var(--warn)', color: '#000', transform: 'scale(0.8)', marginLeft: 4 }}>Reg</span>}
                      {r.needsOcr && <span className="badge" style={{ background: 'var(--err)', color: '#fff', transform: 'scale(0.8)', marginLeft: 4 }}>OCR</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn--tiny" onClick={async () => {
                        const diff = {}
                        if (e.docType !== r.docType) diff.docType = e.docType
                        if (e.docNumber !== r.docNumber) diff.docNumber = e.docNumber
                        if (e.date !== r.date) diff.date = e.date
                        if (e.dueDate !== r.dueDate) diff.dueDate = e.dueDate
                        if (String(e.supplier || '') !== String(r.supplier || '')) diff.supplier = e.supplier
                        if (String(e.customer || '') !== String(r.customer || '')) diff.customer = e.customer
                        if (Number(e.total || 0) !== Number(r.total || 0)) diff.total = Number(e.total || 0)
                        if (Object.keys(diff).length) {
                          await axios.patch(qp(`/api/doc/${encodeURIComponent(r.id)}`, project), diff, { headers: { 'X-Actor': 'process-row' } })
                          setToast({ open: true, text: 'Guardado ✓' })
                        }
                      }}>Guardar</button>
                      <button className="btn btn--tiny primary" disabled={rowHasErrors(e)} onClick={async () => {
                        if (rowHasErrors(e)) { setToast({ open: true, text: 'Preenche o Tipo e o Nº do documento.' }); return }
                        // aplica diff mínimo
                        const diff = {}
                        if (e.docType !== r.docType) diff.docType = e.docType
                        if (e.docNumber !== r.docNumber) diff.docNumber = e.docNumber
                        if (Object.keys(diff).length) {
                          await axios.patch(qp(`/api/doc/${encodeURIComponent(r.id)}`, project), diff, { headers: { 'X-Actor': 'process-row' } })
                        }
                        try {
                          await api.post(qp('/api/doc/finalize', project), { id: r.id, docType: e.docType, docNumber: e.docNumber })
                          setSelected(prev => { const s = new Set(prev); s.delete(r.id); return s })
                          // refresh deste lote
                          if (batchId) {
                            try {
                              const b = await fetch(qp(`/api/batch/${encodeURIComponent(batchId)}`, project)).then(r => r.json())
                              setBatchRows(b.rows || [])
                            } catch {
                              setBatchRows(prev => prev.filter(x => x.id !== r.id))
                            }
                          }
                          window.dispatchEvent(new CustomEvent('reports-refresh'))
                        } catch (err) {
                          setToast({ open: true, text: 'Erro: ' + (err?.response?.data?.error || err.message) })
                        }
                      }}>Confirmar</button>
                      <button className="iconbtn danger" title="Apagar" onClick={() => deleteOne(r.id)}><IconTrash /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="card__footer" style={{ marginTop: 8 }}>
            <b>Selecionados:</b> {selected.size} &nbsp;|&nbsp;
            <b>Total (lote):</b> {fmtEUR(batchRows.reduce((s, x) => s + (Number(x.total) || 0), 0))}
          </div>
        </div>
      )
      }

      <PdfViewerOverlay open={viewer.open} url={viewer.url} onClose={() => setViewer({ open: false, url: '' })} />
    </>
  )
}
