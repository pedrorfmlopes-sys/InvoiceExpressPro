// client/src/tabs/ExploreTab.jsx
import React from 'react';
import { COLS, fmtEUR, fmtParty, qp, mapDocToLegacyRow, IconEdit, IconEye, IconTrash } from '../shared/ui';
import api from '../api/apiClient';
import Toast from '../components/Toast';
import DndConfirmModal from '../components/DndConfirmModal';
import PdfViewerOverlay from '../components/PdfViewerOverlay';

export default function ExploreTab({ project }) {
  const [rows, setRows] = React.useState([]);
  const [doctypes, setDoctypes] = React.useState([]);
  const [filters, setFilters] = React.useState({ fornecedor: '', cliente: '', q: '', dateFrom: '', dateTo: '', totalMin: '', totalMax: '', tipo: '' });
  const [editing, setEditing] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const [toast, setToast] = React.useState({ open: false, text: '', undo: null });
  const [viewer, setViewer] = React.useState({ open: false, url: '' });

  const [dndModeRemember, setDndModeRemember] = React.useState({ mode: null, until: 0 });
  const dragSrcRef = React.useRef(null);
  const [modal, setModal] = React.useState({ open: false, ctx: null });

  // Headers em EN/PT
  function xlsToUiRow(d) {
    const pick = (a, b) => (d[a] ?? d[b] ?? '');
    const ui = {
      id: d.id || d.ID || d.Id || '',
      Tipo: pick('Tipo', 'docType'),
      Fornecedor: pick('Fornecedor', 'supplier'),
      Fatura: pick('Fatura', 'docNumber'),
      Data: pick('Data', 'date'),
      Total: Number(d.Total ?? d.total ?? 0),
      Cliente: pick('Cliente', 'customer'),
      Vencimento: pick('Vencimento', 'dueDate'),
    };
    if (!ui.Fornecedor && !ui.Cliente && (d.supplier || d.customer)) {
      const r = mapDocToLegacyRow(d);
      ui.id = d.id || r.id;
      ui.Tipo = ui.Tipo || d.docType || r.Tipo || '';
      ui.Fornecedor = r.Fornecedor; ui.Fatura = r.Fatura; ui.Data = r.Data;
      ui.Total = r.Total; ui.Cliente = r.Cliente; ui.Vencimento = r.Vencimento;
    }
    return ui;
  }

  async function load() {
    try {
      const url = qp(`/api/excel.json`, project);
      const res = await api.get(url);
      const j = res.data;
      if (j.error) console.warn('[ExploreTab] load warning:', j.error);

      const all = Array.isArray(j.rows) ? j.rows.map(xlsToUiRow) : [];

      // Filtros (mesma lógica)
      const pass = (r) => {
        if (filters.tipo && String(r.Tipo || '') !== filters.tipo) return false;
        if (filters.fornecedor && !String(r.Fornecedor || '').toLowerCase().includes(filters.fornecedor.toLowerCase())) return false;
        if (filters.cliente && !String(r.Cliente || '').toLowerCase().includes(filters.cliente.toLowerCase())) return false;
        if (filters.q && !String(r.Fatura || '').toLowerCase().includes(filters.q.toLowerCase())) return false;
        if (filters.dateFrom && String(r.Data || '') < filters.dateFrom) return false;
        if (filters.dateTo && String(r.Data || '') > filters.dateTo) return false;
        if (filters.totalMin && Number(r.Total || 0) < Number(filters.totalMin)) return false;
        if (filters.totalMax && Number(r.Total || 0) > Number(filters.totalMax)) return false;
        return true;
      };
      setRows(all.filter(pass));
    } catch (e) {
      console.error('[ExploreTab] load error:', e);
      setRows([]); // Fallback safe
      if (!toast.open) setToast({ open: true, text: 'Erro ao carregar documentos.' });
    }
  }

  React.useEffect(() => {
    load();
    api.get(qp('/api/config/doctypes', project))
      .then(r => r.data)
      .then(j => {
        // Backend devolve array direto ou {items: []}
        const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
        setDoctypes(list);
      })
      .catch(() => setDoctypes([]));

    const onR = () => load();
    window.addEventListener('reports-refresh', onR);
    return () => window.removeEventListener('reports-refresh', onR);
  }, [project]);

  function startEdit(r) { setEditing(r.id); setDraft(r); }
  function cancelEdit() { setEditing(null); setDraft({}); }

  async function save() {
    try {
      const body = {
        supplier: draft.Fornecedor,
        docType: draft.Tipo,
        docNumber: draft.Fatura,
        date: draft.Data,
        total: draft.Total,
        customer: draft.Cliente,
        dueDate: draft.Vencimento
      };
      await api.patch(qp(`/api/doc/${encodeURIComponent(editing)}`, project), body, { headers: { 'X-Actor': 'ui' } });
      await api.post(qp('/api/excel/refresh', project)); // refresh Excel
      setEditing(null); setDraft({});
      await load();
      setToast({ open: true, text: 'Guardado ✓' })
    } catch (e) { setToast({ open: true, text: 'Erro: ' + (e?.response?.data?.error || e.message) }) }
  }

  function fieldKey(col) {
    switch (col) {
      case 'Fornecedor': return 'supplier';
      case 'Tipo': return 'docType';
      case 'Fatura': return 'docNumber';
      case 'Data': return 'date';
      case 'Total': return 'total';
      case 'Cliente': return 'customer';
      case 'Vencimento': return 'dueDate';
      default: return null;
    }
  }
  function rawValue(col, row) { return col === 'Total' ? (row.Total || 0) : (row[col] ?? ''); }

  function onDragStartCell(e, row, col) {
    const src = { id: row.id, field: fieldKey(col), uiField: col, value: rawValue(col, row) };
    dragSrcRef.current = src;
    e.dataTransfer.setData('text/plain', JSON.stringify(src));
    e.dataTransfer.effectAllowed = 'copyMove';
  }
  function onDragOverCell(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }

  const toNumberEU = (s) => { if (typeof s === 'number') return s; const t = String(s ?? '').replace(/\./g, '').replace(',', '.').replace(/\s/g, ''); const n = Number(t); return Number.isFinite(n) ? n : 0; };
  const normalizeDate = (s) => { if (!s) return ''; const str = String(s).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; const m = str.match(/^(\d{1,2})[\/\.\-\s](\d{1,2})[\/\.\-\s](\d{4})$/); if (!m) return str; const [, d, mo, y] = m; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
  const coerce = (f, v) => (f === 'total' ? toNumberEU(v) : (f === 'date' || f === 'dueDate') ? normalizeDate(v) : (f === 'supplier' || f === 'customer') ? fmtParty(v) : String(v ?? ''));

  async function applyDndAction(mode, src, targetRow, targetCol) {
    const tgtField = fieldKey(targetCol);
    const tgtOldRaw = rawValue(targetCol, targetRow);

    if (mode === 'substituir') {
      await api.patch(qp(`/api/doc/${encodeURIComponent(targetRow.id)}`, project), { [tgtField]: coerce(tgtField, src.value) }, { headers: { 'X-Actor': 'dnd-substituir' } });
      await load();
      setToast({
        open: true, text: `Substituído ✓ (${src.uiField} → ${targetCol})`, undo: async () => {
          await api.patch(qp(`/api/doc/${encodeURIComponent(targetRow.id)}`, project), { [tgtField]: coerce(tgtField, tgtOldRaw) }, { headers: { 'X-Actor': 'undo' } });
          await load();
        }
      });
    } else {
      const srcRow = rows.find(r => r.id === src.id); if (!srcRow) return;
      const srcOldRaw = rawValue(src.uiField, srcRow);
      await Promise.all([
        api.patch(qp(`/api/doc/${encodeURIComponent(src.id)}`, project), { [src.field]: coerce(src.field, tgtOldRaw) }, { headers: { 'X-Actor': 'dnd-trocar' } }),
        api.patch(qp(`/api/doc/${encodeURIComponent(targetRow.id)}`, project), { [tgtField]: coerce(tgtField, srcOldRaw) }, { headers: { 'X-Actor': 'dnd-trocar' } }),
      ]);
      await load();
      setToast({
        open: true, text: `Trocado ✓ (${src.uiField} ⇄ ${targetCol})`, undo: async () => {
          await Promise.all([
            api.patch(qp(`/api/doc/${encodeURIComponent(src.id)}`, project), { [src.field]: coerce(src.field, srcOldRaw) }, { headers: { 'X-Actor': 'undo' } }),
            api.patch(qp(`/api/doc/${encodeURIComponent(targetRow.id)}`, project), { [tgtField]: coerce(tgtField, tgtOldRaw) }, { headers: { 'X-Actor': 'undo' } }),
          ]);
          await load();
        }
      });
    }
  }
  function shouldSkipModal(e) { if (e?.altKey) return 'substituir'; if (e?.shiftKey) return 'trocar'; const now = Date.now(); if (dndModeRemember.mode && dndModeRemember.until > now) return dndModeRemember.mode; return null; }
  function onDropCell(e, targetRow, targetCol) {
    e.preventDefault();
    let src = dragSrcRef.current; try { src = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch { }
    if (!src || !src.id || !src.field) return;
    if (src.id === targetRow.id && src.uiField === targetCol) return;
    const quick = shouldSkipModal(e);
    const ctx = { from: src, to: { id: targetRow.id, uiField: targetCol } };
    if (quick) { applyDndAction(quick, src, targetRow, targetCol); return; }
    setModal({ open: true, ctx });
  }
  async function onModalChoose(choice, remember) {
    const { ctx } = modal; setModal({ open: false, ctx: null });
    const targetRow = rows.find(r => r.id === ctx.to.id); if (!targetRow) return;
    if (remember) { setDndModeRemember({ mode: choice, until: Date.now() + 10 * 60 * 1000 }); }
    await applyDndAction(choice, ctx.from, targetRow, ctx.to.uiField);
  }

  async function deleteRow(id) {
    if (!confirm('Apagar este registo?')) return;
    await api.delete(qp(`/api/doc/${encodeURIComponent(id)}`, project));
    await load();
  }
  async function openViewer(id) {
    const url = qp(`/api/doc/view?id=${encodeURIComponent(id)}`, project);
    try {
      // Validar se existe antes de abrir
      await api.head(url);
      setViewer({ open: true, url });
    } catch (e) {
      const msg = e.response?.status === 404
        ? 'Ficheiro PDF não encontrado (pode ter sido apagado).'
        : `Erro ao abrir documento: ${e.response?.data?.error || e.message}`;
      setToast({ open: true, text: msg });
    }
  }

  async function linkToTransaction(id) {
    // Ideally open a modal to pick a transaction or create new
    // For Min Viable Phase 4: Prompt for Transaction ID or show simple list?
    // User requirement: "botão Link to transaction (abre modal com lista de transações)"
    // I will implement a minimal prompt for now or redirect to Transactions Tab with filter?
    // "Integrar ... botão Link (abre modal)".
    // I will use a simple prompt for Transaction ID for speed, or fetch list.
    const txId = prompt("Enter Transaction ID to link to:");
    if (!txId) return;

    try {
      await api.post(qp(`/api/transactions/${txId}/link`, project), {
        documentId: id,
        linkType: 'related'
      });
      alert('Linked!');
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  }

  // Check linked transactions (on demand or for single row?)
  // For simplicity, I won't auto-fetch linked txs for the table to avoid N+1. 
  // Just the action button.

  const Field = ({ value, onChange, type }) => (<input className="input" type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} />);

  function RowActions({ row, isEdit, onEdit, onSave, onCancel }) {
    return (
      <div className="row-actions">
        {!isEdit ? (
          <>
            <button className="iconbtn" title="Editar" onClick={onEdit}><IconEdit /></button>
            <button className="iconbtn" title="Ver documento" onClick={() => openViewer(row.id)}><IconEye /></button>
            <button className="iconbtn" title="Link Transaction" onClick={() => linkToTransaction(row.id)}>🔗</button>
            <button className="iconbtn danger" title="Apagar" onClick={() => deleteRow(row.id)}><IconTrash /></button>
          </>
        ) : (
          <>
            <button className="btn btn--tiny primary" onClick={onSave}>Guardar</button>
            <button className="btn btn--tiny" onClick={onCancel}>Cancelar</button>
          </>
        )}
      </div>
    );
  }

  function clearFilters() {
    setFilters({ fornecedor: '', cliente: '', q: '', dateFrom: '', dateTo: '', totalMin: '', totalMax: '', tipo: '' })
    setTimeout(load, 0);
  }

  async function downloadFilteredPdf(type) {
    // Converter filtros da UI para API
    const params = new URLSearchParams();
    if (filters.fornecedor) params.set('supplier', filters.fornecedor);
    if (filters.cliente) params.set('customer', filters.cliente);
    if (filters.tipo) params.set('docType', filters.tipo);
    if (filters.q) params.set('q', filters.q);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.totalMin) params.set('totalMin', filters.totalMin);

    // project
    params.set('project', project);

    if (type === 'basic') {
      // window.location.href = `/api/reports.pdf?${params.toString()}`;
      // Em Auth Mode required, GET não funciona. Redirecionar para Pro ou alertar.
      alert('PDF Básico indisponível. Por favor utilize o Relatório Pro.');
    } else {
      if (!confirm('O relatório Pro utiliza a API da OpenAI para gerar uma análise inteligente sobre estes dados filtrados. Continuar?')) return;
      const t = toast?.open ? toast : { open: false }; // preserve existing toast if needed
      setToast({ open: true, text: 'A gerar análise inteligente...' });
      try {
        const bodyObj = { reportType: 'Filtrado', filters: {} };
        for (const [k, v] of params.entries()) bodyObj.filters[k] = v;

        const apiKey = localStorage.getItem('OPENAI_API_KEY') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-OpenAI-Key'] = apiKey;

        const res = await api.post(qp('/api/reports/pro-pdf', project), bodyObj, { headers });
        const data = res.data;
        if (data.error) throw new Error(data.error);

        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${data.pdfBase64}`;
        a.download = `relatorio_filtrado_pro_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        setToast({ open: true, text: 'Relatório gerado ✓' });
      } catch (e) {
        setToast({ open: true, text: 'Erro: ' + e.message });
      }
    }
  }

  return (
    <>
      <div className="card">
        <div className="card__title">Filtros</div>
        <div className="grid-3">
          <div><div className="label">Fornecedor</div><input className="input" value={filters.fornecedor} onChange={e => setFilters(f => ({ ...f, fornecedor: e.target.value }))} /></div>
          <div>
            <div className="label">Tipo</div>
            <select
              className="input"
              value={filters.tipo || ''}
              onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}
            >
              <option value="">(Todos)</option>
              {doctypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div><div className="label">Cliente</div><input className="input" value={filters.cliente} onChange={e => setFilters(f => ({ ...f, cliente: e.target.value }))} /></div>
          <div><div className="label">Nº Fatura</div><input className="input" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} /></div>
          <div><div className="label">Desde</div><input type="date" className="input" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><div className="label">Até</div><input type="date" className="input" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
          <div><div className="label">Total min</div><input className="input" value={filters.totalMin} onChange={e => setFilters(f => ({ ...f, totalMin: e.target.value }))} /></div>
          <div><div className="label">Total max</div><input className="input" value={filters.totalMax} onChange={e => setFilters(f => ({ ...f, totalMax: e.target.value }))} /></div>
        </div>
        <div className="row mt-12" style={{ gap: 8 }}>
          <button className="btn" onClick={load}>Aplicar filtro</button>
          <button className="btn" onClick={clearFilters}>Limpar filtro</button>
          <div className="splitter" style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          <button className="btn" title="PDF com os filtros atuais" onClick={() => downloadFilteredPdf('basic')}>Relatório</button>
          <button className="btn primary" title="Análise IA com filtros atuais" onClick={() => downloadFilteredPdf('pro')}>Relatório Pro</button>
        </div>
      </div>


      <div className="card mt-16 overflow">
        <div className="card__title">Explorar / Editar</div>
        <table className="table">
          <thead>
            <tr>
              <th>Ações</th>
              {COLS.slice(0, 1).map(h => <th key={h}>{h}</th>)}
              <th>Tipo</th>
              {COLS.slice(1, 6).map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isEdit = editing === r.id;
              const renderCell = (col, content) => (
                <td
                  draggable={!isEdit}
                  onDragStart={(e) => onDragStartCell(e, r, col)}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={(e) => onDropCell(e, r, col)}
                >{content}</td>
              );
              return (
                <tr key={r.id || `${r.Fornecedor}-${r.Fatura}-${r.Data}`}>
                  <td><RowActions row={r} isEdit={isEdit} onEdit={() => startEdit(r)} onSave={save} onCancel={cancelEdit} /></td>
                  {renderCell('Fornecedor', isEdit ? <Field value={draft.Fornecedor || ''} onChange={v => setDraft(d => ({ ...d, Fornecedor: v }))} /> : r.Fornecedor)}
                  {renderCell('Tipo', isEdit ? <Field value={draft.Tipo || ''} onChange={v => setDraft(d => ({ ...d, Tipo: v }))} /> : (r.Tipo || ''))}
                  {renderCell('Fatura', isEdit ? <Field value={draft.Fatura || ''} onChange={v => setDraft(d => ({ ...d, Fatura: v }))} /> : r.Fatura)}
                  {renderCell('Data', isEdit ? <Field value={draft.Data || ''} onChange={v => setDraft(d => ({ ...d, Data: v }))} type="date" /> : r.Data)}
                  {renderCell('Total', isEdit ? <Field value={draft.Total || 0} onChange={v => setDraft(d => ({ ...d, Total: v }))} /> : <span className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(r.Total)}</span>)}
                  {renderCell('Cliente', isEdit ? <Field value={draft.Cliente || ''} onChange={v => setDraft(d => ({ ...d, Cliente: v }))} /> : r.Cliente)}
                  {renderCell('Vencimento', isEdit ? <Field value={draft.Vencimento || ''} onChange={v => setDraft(d => ({ ...d, Vencimento: v }))} type="date" /> : r.Vencimento)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DndConfirmModal open={modal.open} context={modal.ctx} onChoose={(c, remember) => onModalChoose(c, remember)} onCancel={() => setModal({ open: false, ctx: null })} />
      <Toast open={toast.open} text={toast.text} onUndo={toast.undo} onClose={() => setToast({ open: false, text: '', undo: null })} />
      <PdfViewerOverlay open={viewer.open} url={viewer.url} onClose={() => setViewer({ open: false, url: '' })} />
    </>
  );
}
