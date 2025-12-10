// server/server.js
// Funcionalidades adicionadas sem remover as existentes:
// - /api/dirs, /api/mkdir, /api/set-output (gestão de pasta/nome do Excel por projeto)
// - /api/projects/:name (DELETE)
// - Relatórios: /api/reports/suppliers|monthly|customers, /api/reports.xlsx, /api/reports.pdf, /api/export.csv
// - Templates: /api/templates (GET/POST)
// - Logo: /api/app-logo (POST)
// - Normalize: POST/DELETE (alias→canónico)
// - Audit: GET devolve array e suporta ?invoice=
// - writeExcelFromDocs usa excelOutputPath do projeto
// Mantidos: extract/staging, finalize+dedupe, bulk-delete, merge, export.xlsx, export.pdf, view

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');



let OpenAI = null; try { OpenAI = require('openai'); } catch { }

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

/* ========= Infra básica ========= */
const ROOT = path.resolve(__dirname, '../data');
const DIR_PROJECTS = path.join(ROOT, 'projects');
const DIR_CONFIG = path.join(ROOT, 'config');
fs.mkdirSync(DIR_PROJECTS, { recursive: true });
fs.mkdirSync(DIR_CONFIG, { recursive: true });

// === DocTypes synonyms base (ficheiro global de config) ===
const FILE_SYNONYMS = path.join(DIR_CONFIG, 'doctypes.synonyms.json');

const sanitize = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]+/g, '_');
const ensureFile = (p, content) => { if (!fs.existsSync(p)) fs.writeFileSync(p, content); };


function coercePartyToString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    const name = String(v.name || '').trim();
    const vat = String(v.vatNumber || v.nif || '').trim();
    const addr = String(v.address || '').trim();
    if (name) return name;
    const parts = [name, vat, addr].filter(Boolean);
    return parts.length ? parts.join(' - ') : JSON.stringify(v);
  }
  return String(v);
}

function ctxOf(projectRaw) {
  const project = sanitize(projectRaw || 'default');
  const base = path.join(DIR_PROJECTS, project);
  const dirs = {
    base,
    uploads: path.join(base, 'uploads'),
    staging: path.join(base, 'staging'),
    archive: path.join(base, 'archive'),
    templates: path.join(base, 'templates'),
  };
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

  const files = {
    docs: path.join(base, 'docs.json'),
    audit: path.join(base, 'audit.json'),
    normalize: path.join(base, 'normalize.json'),
    links: path.join(base, 'links.json'),
    excel: path.join(base, 'invoices.xlsx'), // default (compat)
    doctypes: path.join(DIR_CONFIG, 'doctypes.json'),
    config: path.join(base, 'project.config.json'),
    logo: path.join(DIR_CONFIG, 'logo.png'),
    synonyms: FILE_SYNONYMS,
  };
  ensureFile(files.docs, JSON.stringify({ rows: [] }, null, 2));
  ensureFile(files.audit, JSON.stringify([], null, 2));
  ensureFile(files.normalize, JSON.stringify({ suppliers: {}, customers: {} }, null, 2));
  ensureFile(files.links, JSON.stringify({ rows: [] }, null, 2));
  if (!fs.existsSync(files.doctypes)) {
    fs.writeFileSync(files.doctypes, JSON.stringify({ items: ["Fatura", "Encomenda", "Proposta", "Recibo", "NotaCredito", "Documento"] }, null, 2));
  }
  if (!fs.existsSync(files.config)) {
    fs.writeFileSync(files.config, JSON.stringify({ excelOutputPath: files.excel }, null, 2));
  }

  if (!fs.existsSync(files.synonyms)) {
    fs.writeFileSync(files.synonyms, JSON.stringify({
      Fatura: ["invoice", "fattura", "factura", "facture", "nota fiscal", "nota", "bill"],
      Encomenda: ["order", "purchase order", "po", "ordem de compra", "pedido"],
      Proposta: ["proposal", "quote", "quotation", "orçamento", "orcamento", "preventivo"],
      Recibo: ["receipt", "recibo", "ricevuta"],
      NotaCredito: ["credit note", "nota de crédito", "nota credito", "nota di credito", "abono", "avoir"],
      Documento: ["document", "doc", "other", "outro", "diverso"]
    }, null, 2));
  }

  const readJSON = (k) => JSON.parse(fs.readFileSync(files[k], 'utf8'));
  const writeJSON = (k, obj) => fs.writeFileSync(files[k], JSON.stringify(obj, null, 2));
  const getExcelOut = () => {
    try { return (readJSON('config').excelOutputPath) || files.excel; } catch { return files.excel; }
  };
  const writeExcelFromDocs = () => {
    const rows = readJSON('docs').rows;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos');
    const out = getExcelOut();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    XLSX.writeFile(wb, out);
  };

  return { project, dirs, files, readJSON, writeJSON, writeExcelFromDocs, getExcelOut };
}

function logAudit(ctx, evt, payload) {
  try {
    const arr = JSON.parse(fs.readFileSync(ctx.files.audit, 'utf8'));
    arr.push({ id: uuidv4(), ts: new Date().toISOString(), ...payload, action: evt });
    fs.writeFileSync(ctx.files.audit, JSON.stringify(arr, null, 2));
  } catch { }
}

/* ========= Projetos ========= */
app.get('/api/projects', (req, res) => {
  const names = fs.readdirSync(DIR_PROJECTS).filter(n => fs.statSync(path.join(DIR_PROJECTS, n)).isDirectory()).sort();
  res.json({ projects: names });
});
app.post('/api/projects', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  ctxOf(name); res.json({ ok: true });
});
app.delete('/api/projects/:name', (req, res) => {
  const name = sanitize(req.params.name || '');
  if (!name || name === 'default') return res.status(400).json({ error: 'invalid project' });
  const p = path.join(DIR_PROJECTS, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  // atenção: destrutivo
  fs.rmSync(p, { recursive: true, force: true });
  res.json({ ok: true });
});

/* ========= Upload ========= */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, ctxOf(req.query.project).dirs.uploads),
  filename: (_req, file, cb) => cb(null, Date.now() + '_' + sanitize(file.originalname)),
});
const upload = multer({ storage });

/* ========= Saúde ========= */
app.get('/api/health', (req, res) => {
  const ctx = ctxOf(req.query.project);
  res.json({ ok: true, project: ctx.project, excelOutputPath: ctx.getExcelOut(), projectBase: ctx.dirs.base });
});

/* ========= Config: Tipos ========= */
app.get('/api/config/doctypes', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const j = JSON.parse(fs.readFileSync(ctx.files.doctypes, 'utf8'));
  res.json({ items: Array.isArray(j.items) && j.items.length ? j.items : ["Fatura", "Encomenda", "Proposta", "Recibo", "NotaCredito", "Documento"] });
});
app.put('/api/config/doctypes', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
  const clean = Array.from(new Set(items.map(x => String(x || '').trim()).filter(Boolean)));
  fs.writeFileSync(ctx.files.doctypes, JSON.stringify({ items: clean }, null, 2));
  res.json({ ok: true, items: clean });
});

/* ========= Dirs + Output Excel ========= */
app.get('/api/dirs', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const entries = fs.readdirSync(ctx.dirs.base).filter(n => {
    try { return fs.statSync(path.join(ctx.dirs.base, n)).isDirectory() } catch { return false }
  }).sort();
  res.json({ entries, excelOutputPath: ctx.getExcelOut(), projectBase: ctx.dirs.base });
});
app.post('/api/mkdir', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { dir } = req.body || {};
  const name = sanitize(dir || '');
  if (!name) return res.status(400).json({ error: 'dir required' });
  const p = path.join(ctx.dirs.base, name);
  fs.mkdirSync(p, { recursive: true });
  res.json({ ok: true, dir: name });
});
app.post('/api/set-output', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { dir, name } = req.body || {};
  const d = dir ? sanitize(dir) : '';
  const nm = name ? sanitize(name) : 'invoices.xlsx';
  const out = path.join(ctx.dirs.base, d, nm);
  const cfg = ctx.readJSON('config'); cfg.excelOutputPath = out; ctx.writeJSON('config', cfg);
  res.json({ ok: true, excelOutputPath: out });
});

/* ========= Progress ========= */
const progressMap = new Map();
const progInit = (id, total, project) => progressMap.set(id, { project, total, done: 0, errors: 0 });
const progInc = (id, key) => { const p = progressMap.get(id) || { total: 0, done: 0, errors: 0 }; p[key] = (p[key] || 0) + 1; progressMap.set(id, p); };
app.get('/api/progress/:batchId', (req, res) => { res.json(progressMap.get(req.params.batchId) || null) });

// ========= Batch (memória do lote atual) + debug =========
const batchRowsMap = new Map(); // batchId -> [{id, docType, docNumber, ...}]
let lastExtractError = null;

function batchInit(batchId) {
  batchRowsMap.set(batchId, []);
}
function batchPush(batchId, row) {
  const arr = batchRowsMap.get(batchId);
  if (!arr) return;
  arr.push({
    id: row.id,
    docType: row.docType || '',
    docNumber: row.docNumber || '',
    date: row.date || '',
    dueDate: row.dueDate || '',
    supplier: coercePartyToString(row.supplier || ''),
    customer: coercePartyToString(row.customer || ''),
    total: Number(row.total) || 0,
  });
}
function batchGet(batchId) {
  return batchRowsMap.get(batchId) || [];
}

// Lote atual para a UI Processar
app.get('/api/batch/:batchId', (req, res) => {
  const batchId = String(req.params.batchId || '');
  res.json({ rows: batchGet(batchId) });
});

// Endpoints de debug rápidos
app.get('/api/debug/status', (_req, res) => {
  res.json({
    batches: Array.from(batchRowsMap.keys()),
    progress: Array.from(progressMap.entries()),
    now: new Date().toISOString(),
  });
});
app.get('/api/debug/last-error', (_req, res) => {
  res.json(lastExtractError || null);
});


/* ========= Extract (staging) ========= */
app.post('/api/extract', upload.array('files'), async (req, res) => {
  const ctx = ctxOf(req.query.project);
  const batchId = (req.query.batchId && String(req.query.batchId)) || uuidv4();

  const keyFromHeader = req.get('X-OpenAI-Key');
  const apiKey = keyFromHeader || process.env.OPENAI_API_KEY || '';
  const openai = (OpenAI && apiKey) ? new OpenAI({ apiKey }) : null;

  // inicializa progresso + lote + responde já à UI
  progInit(batchId, req.files.length, ctx.project);
  batchInit(batchId);
  res.json({ batchId, count: req.files.length, project: ctx.project, aiRequested: true, hasApiKey: !!apiKey });

  for (const f of req.files) {
    try {
      // 1) extrair texto
      const buf = fs.readFileSync(f.path);
      const parsed = await pdf(buf);
      const text = String(parsed.text || '');

      // 2) extrair campos
      let fields = null, usedAI = false;
      if (openai) {
        try { fields = await extractWithAI(openai, text); usedAI = true; } catch (e) { /* cai na heurística */ }
      }
      if (!fields) fields = extractHeuristic(text);

      // 3) mover para staging
      const stagingName = Date.now() + '_' + sanitize(path.basename(f.originalname || 'documento.pdf'));
      const stagingPath = path.join(ctx.dirs.staging, stagingName);
      fs.renameSync(f.path, stagingPath);

      // 4) registo
      const row = {
        id: uuidv4(),
        project: ctx.project,
        batchId,
        docType: fields.docType || '',
        docNumber: (fields.docNumber || '').trim(),
        date: fields.date || '',
        dueDate: fields.dueDate || '',
        supplier: coercePartyToString(fields.supplier || ''),
        customer: coercePartyToString(fields.customer || ''),
        total: Number(fields.total) || 0,
        currency: fields.currency || 'EUR',
        source: usedAI ? 'upload+ia' : 'upload',
        status: 'staging',
        filePath: stagingPath,
        size: fs.statSync(stagingPath).size,
        createdAt: new Date().toISOString(),
        meta: fields.meta || {}
      };

      // 5) guardar + empurrar para o lote
      const db = ctx.readJSON('docs');
      db.rows.push(row);
      ctx.writeJSON('docs', db);
      batchPush(batchId, row);

      // 6) auditoria + progresso
      logAudit(ctx, 'upload', { id: row.id, file: stagingPath, size: row.size });
      progInc(batchId, 'done');

      // log útil
      console.log(`[extract] ok -> ${row.id} | ${path.basename(stagingPath)} | ${row.docType} ${row.docNumber}`);

    } catch (e) {
      lastExtractError = { ts: new Date().toISOString(), message: e?.message || String(e), stack: e?.stack || '', file: f?.originalname || '' };
      console.error('[extract] erro:', lastExtractError);
      progInc(batchId, 'errors');
      try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path) } catch { }
    }
  }
});

app.patch('/api/doc/:id', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const id = req.params.id;
  const updates = { ...req.body };

  // normalizar parties
  if ('supplier' in updates) updates.supplier = coercePartyToString(updates.supplier);
  if ('customer' in updates) updates.customer = coercePartyToString(updates.customer);

  // normalizar docType para o canónico configurado (mantém compat com sinónimos)
  if ('docType' in updates) {
    const norm = normalizeDocTypeValue(ctx, updates.docType || '');
    updates.docType = norm.canonical || updates.docType || '';
  }

  const db = ctx.readJSON('docs');
  const idx = db.rows.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  db.rows[idx] = { ...db.rows[idx], ...updates };
  fs.writeFileSync(ctx.files.docs, JSON.stringify(db, null, 2));
  res.json({ ok: true, row: db.rows[idx] });
});

app.delete('/api/doc/:id', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const id = req.params.id;
  const db = ctx.readJSON('docs');
  const idx = db.rows.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const row = db.rows[idx];
  try { if (row.filePath && fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath) } catch { }
  db.rows.splice(idx, 1);
  fs.writeFileSync(ctx.files.docs, JSON.stringify(db, null, 2));
  logAudit(ctx, 'delete_one', { id });
  res.json({ ok: true });
});

/* ========= View PDF ========= */
app.get('/api/doc/view', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { id, docType, docNumber } = req.query;
  let fp = '';
  if (id) {
    const row = ctx.readJSON('docs').rows.find(r => r.id === id);
    if (!row) return res.status(404).json({ error: 'not found' });
    fp = row.filePath;
  } else if (docType && docNumber) {
    fp = findInArchive(ctx, String(docType), String(docNumber));
  } else return res.status(400).json({ error: 'id ou docType+docNumber obrigatórios' });
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'file not found' });
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(fp).pipe(res);
});
function findInArchive(ctx, docType, docNumber) {
  const ys = (fs.existsSync(ctx.dirs.archive) ? fs.readdirSync(ctx.dirs.archive) : []).map(y => path.join(ctx.dirs.archive, y));
  for (const y of ys) {
    const ms = (fs.existsSync(y) ? fs.readdirSync(y) : []).map(m => path.join(y, m));
    for (const m of ms) {
      const cand = path.join(m, `${sanitize(docType)}-${sanitize(docNumber)}.pdf`);
      if (fs.existsSync(cand)) return cand;
    }
  }
  return '';
}

/* ========= Finalize (anti-duplicados forte) ========= */
app.post('/api/doc/finalize', async (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { id, docType, docNumber } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  const db = ctx.readJSON('docs');
  const idx = db.rows.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const row = db.rows[idx];

  // normalizar Tipo (usa tabela + sinónimos) ANTES de validar duplicado/destino
  const norm = normalizeDocTypeValue(ctx, docType || row.docType || '');
  const finalType = norm.canonical || (docType || row.docType || '');
  if (!finalType) return res.status(400).json({ error: 'docType required' });

  const finalNumber = String((docNumber || row.docNumber || '')).trim();
  if (!finalNumber) return res.status(400).json({ error: 'docNumber vazio — preencha antes de finalizar.' });

  // dedupe por Tipo+Número já processado
  const dup = db.rows.find(r =>
    r.id !== id &&
    r.status === 'processado' &&
    String(r.docType || '').toLowerCase() === String(finalType).toLowerCase() &&
    String(r.docNumber || '').toLowerCase() === finalNumber.toLowerCase()
  );
  if (dup) return res.status(409).json({ error: 'Documento duplicado (Tipo+Número já existente).' });

  if (!row.filePath || !fs.existsSync(row.filePath)) return res.status(404).json({ error: 'staging file missing' });

  // destino no arquivo por ano/mês com nome Tipo-Numero.pdf
  const now = new Date(); const yyyy = String(now.getFullYear()); const mm = String(now.getMonth() + 1).padStart(2, '0');
  const outDir = path.join(ctx.dirs.archive, yyyy, mm);
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, `${sanitize(finalType)}-${sanitize(finalNumber)}.pdf`);
  if (fs.existsSync(dest)) return res.status(409).json({ error: 'Já existe ficheiro igual no arquivo (mesmo Tipo+Número).' });

  // escrever PDF otimizado (em vez de rename)
  await optimizeAndWritePdf(row.filePath, dest);
  try { fs.unlinkSync(row.filePath) } catch { }

  db.rows[idx] = {
    ...row,
    docType: finalType,
    docNumber: finalNumber,
    status: 'processado',
    filePath: dest,
    size: fs.statSync(dest).size,
    createdAt: row.createdAt || new Date().toISOString()
  };
  fs.writeFileSync(ctx.files.docs, JSON.stringify(db, null, 2));
  logAudit(ctx, 'finalize', { id, docType: finalType, docNumber: finalNumber, dest });

  try { ctx.writeExcelFromDocs() } catch { }

  res.json({ ok: true, row: db.rows[idx] });
});

app.post('/api/docs/finalize-bulk', async (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items[] required' });

  const results = [];
  for (const it of items) {
    try {
      const r = await finalizeOne(ctx, it.id, it.docType, it.docNumber);
      results.push({ id: it.id, ok: true, row: r });
    } catch (e) {
      results.push({ id: it.id, ok: false, error: e.message || String(e) });
    }
  }
  res.json({ ok: true, results });
});

async function finalizeOne(ctx, id, docType, docNumber) {
  const db = ctx.readJSON('docs');
  const idx = db.rows.findIndex(r => r.id === id);
  if (idx === -1) throw new Error('not found');

  const row = db.rows[idx];
  const finalNumber = String((docNumber || row.docNumber || '')).trim();
  if (!finalNumber) throw new Error('docNumber vazio — preencha antes de finalizar.');

  const norm = normalizeDocTypeValue(ctx, docType || row.docType || '');
  const finalType = norm.canonical || (docType || row.docType || '');

  const dup = checkDuplicate(db, id, finalType, finalNumber);
  if (dup) throw new Error('duplicado');

  if (!row.filePath || !fs.existsSync(row.filePath)) throw new Error('staging file missing');

  const dest = ensureArchiveDest(ctx, finalType, finalNumber);
  if (fs.existsSync(dest)) throw new Error('arquivo existente');

  await optimizeAndWritePdf(row.filePath, dest);
  try { fs.unlinkSync(row.filePath) } catch { }

  db.rows[idx] = { ...row, docType: finalType, docNumber: finalNumber, status: 'processado', filePath: dest, size: fs.statSync(dest).size, createdAt: row.createdAt || new Date().toISOString() };
  fs.writeFileSync(ctx.files.docs, JSON.stringify(db, null, 2));
  logAudit(ctx, 'finalize', { id, docType: finalType, docNumber: finalNumber, dest });

  try { ctx.writeExcelFromDocs() } catch { }

  return db.rows[idx];
}



/* ========= Duplicados: delete/merge ========= */
app.post('/api/docs/bulk-delete', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });

  const db = ctx.readJSON('docs');
  const left = [];
  for (const row of db.rows) {
    if (ids.includes(row.id)) {
      try { if (row.filePath && fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath) } catch { }
      logAudit(ctx, 'delete_bulk_item', { id: row.id, file: row.filePath || null });
      continue;
    }
    left.push(row);
  }
  ctx.writeJSON('docs', { rows: left });
  logAudit(ctx, 'delete_bulk', { count: ids.length });
  res.json({ ok: true, removed: ids.length });
});

app.post('/api/docs/merge', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { keepId, others } = req.body || {};
  if (!keepId || !Array.isArray(others) || !others.length) return res.status(400).json({ error: 'keepId and others[] required' });

  const db = ctx.readJSON('docs');
  const keepIdx = db.rows.findIndex(r => r.id === keepId);
  if (keepIdx === -1) return res.status(404).json({ error: 'keep not found' });

  const keep = db.rows[keepIdx];
  for (const oid of others) {
    const i = db.rows.findIndex(r => r.id === oid);
    if (i === -1) continue;
    const r = db.rows[i];
    if (!keep.docType && r.docType) keep.docType = r.docType;
    if (!keep.docNumber && r.docNumber) keep.docNumber = r.docNumber;
    if (!keep.date && r.date) keep.date = r.date;
    if (!keep.dueDate && r.dueDate) keep.dueDate = r.dueDate;
    if ((Number(keep.total) || 0) < (Number(r.total) || 0)) keep.total = r.total;
    if (!keep.supplier && r.supplier) keep.supplier = r.supplier;
    if (!keep.customer && r.customer) keep.customer = r.customer;

    try { if (r.filePath && fs.existsSync(r.filePath)) fs.unlinkSync(r.filePath) } catch { }
    db.rows.splice(i, 1);
  }
  db.rows[keepIdx] = keep;
  ctx.writeJSON('docs', db);
  logAudit(ctx, 'merge', { keepId, merged: others.length });
  res.json({ ok: true, keep });
});

// === Excel API ===
// Lê o Excel atual do projeto e devolve JSON de linhas
app.get('/api/excel.json', (req, res) => {
  try {
    const ctx = ctxOf(req.query.project);
    const out = ctx.getExcelOut();
    if (!fs.existsSync(out)) {
      return res.status(404).json({ error: 'Excel não encontrado', excelPath: out });
    }
    const wb = XLSX.readFile(out);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    res.json({ rows, excelPath: out });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Regera o Excel a partir do docs.json (para refletir edições)
app.post('/api/excel/refresh', (req, res) => {
  try {
    const ctx = ctxOf(req.query.project);
    ctx.writeExcelFromDocs();
    res.json({ ok: true, excelPath: ctx.getExcelOut() });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});





/* ========= Normalizações ========= */
app.get('/api/normalize', (req, res) => {
  const ctx = ctxOf(req.query.project);
  res.json(JSON.parse(fs.readFileSync(ctx.files.normalize, 'utf8')));
});
app.put('/api/normalize', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { suppliers, customers } = req.body || {};
  const obj = {
    suppliers: suppliers && typeof suppliers === 'object' ? suppliers : {},
    customers: customers && typeof customers === 'object' ? customers : {},
  };
  fs.writeFileSync(ctx.files.normalize, JSON.stringify(obj, null, 2));
  logAudit(ctx, 'normalize_save', { counts: { suppliers: Object.keys(obj.suppliers).length, customers: Object.keys(obj.customers).length } });
  res.json({ ok: true });
});
// add: POST (add alias) e DELETE (remove alias)
app.post('/api/normalize', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { type, alias, canonical } = req.body || {};
  if (!['suppliers', 'customers'].includes(type)) return res.status(400).json({ error: 'type invalid' });
  if (!alias || !canonical) return res.status(400).json({ error: 'alias & canonical required' });
  const obj = ctx.readJSON('normalize');
  obj[type][String(alias)] = String(canonical);
  ctx.writeJSON('normalize', obj);
  logAudit(ctx, 'normalize_add', { type, alias, canonical });
  res.json({ ok: true });
});
app.delete('/api/normalize', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { type, alias } = req.body || {};
  if (!['suppliers', 'customers'].includes(type)) return res.status(400).json({ error: 'type invalid' });
  if (!alias) return res.status(400).json({ error: 'alias required' });
  const obj = ctx.readJSON('normalize');
  delete obj[type][String(alias)];
  ctx.writeJSON('normalize', obj);
  logAudit(ctx, 'normalize_delete', { type, alias });
  res.json({ ok: true });
});

/* ========= Auditoria ========= */
app.get('/api/audit', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const invoice = String(req.query.invoice || '').trim().toLowerCase();
  const arr = JSON.parse(fs.readFileSync(ctx.files.audit, 'utf8'));
  const out = arr
    .filter(e => !invoice || String(e.invoice || '').toLowerCase().includes(invoice))
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  // devolvemos ARRAY (compat com App.jsx)
  res.json(out);
});

/* ========= Export Detalhe ========= */
app.get('/api/export.xlsx', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const data = rows.map(r => ({
    Tipo: r.docType || '',
    Fornecedor: coercePartyToString(r.supplier || ''),
    Fatura: r.docNumber || '',
    Data: r.date || '',
    Total: Number(r.total) || 0,
    Cliente: coercePartyToString(r.customer || ''),
    Vencimento: r.dueDate || '',
  }));
  const header = ['Tipo', 'Fornecedor', 'Fatura', 'Data', 'Total', 'Cliente', 'Vencimento'];
  const aoa = [header]; let sum = 0;
  for (const r of data) { sum += Number(r.Total) || 0; aoa.push([r.Tipo, r.Fornecedor, r.Fatura, r.Data, r.Total, r.Cliente, r.Vencimento]) }
  aoa.push(['', '', '', 'TOTAL', sum, '', '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Export'); const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="export.xlsx"'); res.send(buf);
});
app.get('/api/export.csv', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const header = ['Tipo', 'Fornecedor', 'Fatura', 'Data', 'Total', 'Cliente', 'Vencimento'];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push([
      r.docType || '',
      safeCsv(coercePartyToString(r.supplier || '')),
      safeCsv(r.docNumber || ''),
      r.date || '',
      String(Number(r.total) || 0).replace('.', ','),
      safeCsv(coercePartyToString(r.customer || '')),
      r.dueDate || '',
    ].join(';'));
  }
  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
  res.send(Buffer.from('\uFEFF' + csv, 'utf8')); // BOM p/ Excel
});

/* ========= Export PDF detalhe (mantido) ========= */
app.get('/api/export.pdf', async (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const data = rows.map(r => ({
    Tipo: r.docType || '',
    Fornecedor: coercePartyToString(r.supplier || ''),
    Fatura: r.docNumber || '',
    Data: r.date || '',
    Total: Number(r.total) || 0,
    Cliente: coercePartyToString(r.customer || ''),
    Vencimento: r.dueDate || ''
  }));
  const pageW = 595, pageH = 842, margin = 36, lineH = 13, fontSize = 9;
  const colW = [56, 150, 70, 60, 60, 135, 64];
  const header = ['Tipo', 'Fornecedor', 'Fatura', 'Data', 'Total', 'Cliente', 'Vencimento'];
  const totals = data.reduce((a, r) => a + (Number(r.Total) || 0), 0);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([pageW, pageH]);

  const drawRow = (arr, y, bold = false) => {
    let x = margin;
    for (let i = 0; i < arr.length; i++) {
      const txt = String(arr[i] ?? '');
      page.drawText(txt, { x: x + 3, y, size: bold ? fontSize + 1 : fontSize, font, maxWidth: colW[i] - 6 });
      x += colW[i];
    }
  };
  page.drawText('Exportação', { x: margin, y: pageH - margin - 8, size: fontSize + 3, font });
  let y = pageH - margin - 24;
  drawRow(header, y, true); y -= lineH;

  for (const r of data) {
    const arr = [r.Tipo, r.Fornecedor, r.Fatura, r.Data, (r.Total || 0).toFixed(2), r.Cliente, r.Vencimento];
    if (y < margin + 40) { page = doc.addPage([pageW, pageH]); y = pageH - margin - 24; drawRow(header, y, true); y -= lineH; }
    drawRow(arr, y); y -= lineH;
  }
  drawRow(['', '', '', 'TOTAL', totals.toFixed(2), '', ''], Math.max(y, margin + 10), true);

  const bytes = await doc.save();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="export.pdf"');
  res.send(Buffer.from(bytes));
});

/* ========= Relatórios (Top10 + Monthly) ========= */
app.get('/api/reports/suppliers', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const map = new Map();
  for (const r of rows) {
    const k = coercePartyToString(r.supplier || '') || '(vazio)';
    map.set(k, (map.get(k) || 0) + (Number(r.total) || 0));
  }
  const out = Array.from(map, ([key, sum]) => ({ key, total: sum })).sort((a, b) => b.total - a.total);
  res.json(out);
});
app.get('/api/reports/customers', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const map = new Map();
  for (const r of rows) {
    const k = coercePartyToString(r.customer || '') || '(vazio)';
    map.set(k, (map.get(k) || 0) + (Number(r.total) || 0));
  }
  const out = Array.from(map, ([key, sum]) => ({ key, total: sum })).sort((a, b) => b.total - a.total);
  res.json(out);
});
app.get('/api/reports/monthly', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const rows = filterDocs(req.query, ctx.readJSON('docs').rows);
  const map = new Map();
  for (const r of rows) {
    const m = (String(r.date || '').slice(0, 7)) || '(sem data)';
    map.set(m, (map.get(m) || 0) + (Number(r.total) || 0));
  }
  const out = Array.from(map, ([key, sum]) => ({ key, total: sum })).sort((a, b) => a.key.localeCompare(b.key));
  res.json(out);
});
app.get('/api/reports.xlsx', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const sup = getJson('/api/reports/suppliers', ctx);
  const mon = getJson('/api/reports/monthly', ctx);
  const cus = getJson('/api/reports/customers', ctx);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sup), 'TopFornecedores');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mon), 'Mensal');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cus), 'TopClientes');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reports.xlsx"'); res.send(buf);
});
/* ========= Relatórios PDF (Basic & Pro) ========= */
// Helper de desenho melhorado
async function drawReportHeader(doc, page, title, ctx, font, helvBold) {
  const { width, height } = page.getSize();
  const logoPath = ctx.files.logo;
  if (fs.existsSync(logoPath)) {
    try {
      const pngImage = await doc.embedPng(fs.readFileSync(logoPath));
      const dims = pngImage.scale(0.5);
      // Ajustar se for muito grande
      const scale = Math.min(100 / dims.width, 50 / dims.height, 0.5);
      const w = dims.width * scale; const h = dims.height * scale;
      page.drawImage(pngImage, { x: 36, y: height - 36 - h, width: w, height: h });
    } catch (e) { /* ignore */ }
  }
  page.drawText('Invoice Studio', { x: 36, y: height - 30, size: 10, font: helvBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(title, { x: 36, y: height - 80, size: 24, font: helvBold, color: rgb(0, 0, 0) });
  page.drawText(`Gerado em: ${new Date().toLocaleString('pt-PT')}`, { x: width - 200, y: height - 30, size: 9, font });
  return height - 120;
}

app.get('/api/reports.pdf', async (req, res) => {
  try {
    const ctx = ctxOf(req.query.project);
    const rows = filterDocs(req.query, ctx.readJSON('docs').rows);

    // Agregados
    const supMap = new Map(); const cusMap = new Map(); const monMap = new Map();
    let grandTotal = 0;
    for (const r of rows) {
      const val = Number(r.total) || 0;
      grandTotal += val;
      const s = coercePartyToString(r.supplier || '') || '(Outros)';
      supMap.set(s, (supMap.get(s) || 0) + val);
      const c = coercePartyToString(r.customer || '') || '(Outros)';
      cusMap.set(c, (cusMap.get(c) || 0) + val);
      const m = (String(r.date || '').slice(0, 7)) || '(S/ Data)';
      monMap.set(m, (monMap.get(m) || 0) + val);
    }
    const supList = Array.from(supMap, ([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 15);
    const cusList = Array.from(cusMap, ([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 15);
    const monList = Array.from(monMap, ([k, v]) => ({ k, v })).sort((a, b) => a.k.localeCompare(b.k));

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([595, 842]);
    let y = await drawReportHeader(doc, page, 'Relatório Financeiro', ctx, font, fontBold);

    // Resumo
    page.drawText('Resumo Geral', { x: 36, y, size: 16, font: fontBold }); y -= 24;
    page.drawText(`Total de Documentos: ${rows.length}`, { x: 36, y, size: 11, font });
    page.drawText(`Valor Total: ${grandTotal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`, { x: 200, y, size: 11, font: fontBold }); y -= 40;

    // Tabelas Helper
    const drawTable = (title, items, col1Name) => {
      if (y < 150) { page = doc.addPage([595, 842]); y = 750; }
      page.drawText(title, { x: 36, y, size: 14, font: fontBold, color: rgb(0.1, 0.4, 0.6) }); y -= 20;
      // Header
      page.drawRectangle({ x: 36, y: y - 5, width: 520, height: 18, color: rgb(0.9, 0.95, 1) });
      page.drawText(col1Name, { x: 40, y, size: 10, font: fontBold });
      page.drawText('Total (€)', { x: 450, y, size: 10, font: fontBold });
      y -= 18;
      for (const item of items) {
        if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
        const name = item.k.length > 60 ? item.k.slice(0, 60) + '...' : item.k;
        startM = y;
        page.drawText(name, { x: 40, y, size: 9, font });
        page.drawText(item.v.toLocaleString('pt-PT', { minimumFractionDigits: 2 }), { x: 450, y, size: 9, font });
        y -= 14;
      }
      y -= 20;
    };

    drawTable('Top Fornecedores', supList, 'Fornecedor');
    drawTable('Top Clientes', cusList, 'Cliente');
    drawTable('Evolução Mensal', monList, 'Mês');

    const bytes = await doc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report_basic.pdf"');
    res.send(Buffer.from(bytes));
  } catch (e) {
    console.error(e);
    res.status(500).send('Erro ao gerar PDF: ' + e.message);
  }
});

app.post('/api/reports/pro-pdf', async (req, res) => {
  try {
    const ctx = ctxOf(req.query.project);
    const { reportType, filters } = req.body || {};
    // Filtros aplicados no frontend passam no body ou query, mas vamos usar filterDocs com o objecto filters
    const rows = filterDocs(filters || req.query, ctx.readJSON('docs').rows);

    const keyFromHeader = req.get('X-OpenAI-Key');
    const apiKey = keyFromHeader || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(401).json({ error: 'OpenAI API Key não configurada.' });
    const openai = new OpenAI({ apiKey });

    // Preparar dados para IA
    let grandTotal = 0;
    const supMap = new Map(); const cusMap = new Map(); const monMap = new Map();
    rows.forEach(r => {
      const v = Number(r.total) || 0; grandTotal += v;
      supMap.set(r.supplier, (supMap.get(r.supplier) || 0) + v);
      cusMap.set(r.customer, (cusMap.get(r.customer) || 0) + v);
      monMap.set(r.date ? r.date.slice(0, 7) : 'N/A', (monMap.get(r.date ? r.date.slice(0, 7) : 'N/A') || 0) + v);
    });
    const topSup = Array.from(supMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => `${x[0]}: ${x[1].toFixed(2)}€`).join(', ');
    const topCus = Array.from(cusMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => `${x[0]}: ${x[1].toFixed(2)}€`).join(', ');
    const monthly = Array.from(monMap).sort().map(x => `${x[0]}: ${x[1].toFixed(2)}€`).join('; ');

    // Prompt
    const prompt = `Analisa estes dados financeiros de uma empresa e gera um resumo executivo profissional em Português.
    Foca em tendências, principais gastos e receitas, e anomalias.
    Texto formatado em parágrafos claros. Não uses Markdown, apenas texto puro.
    
    Total Movimentado: ${grandTotal.toFixed(2)} €
    Top Fornecedores: ${topSup}
    Top Clientes: ${topCus}
    Mensal: ${monthly}
    Contexto: Relatório ${reportType || 'Geral'}.`;

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const analysis = completion.choices[0].message.content;

    // Gerar PDF
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([595, 842]);
    let y = await drawReportHeader(doc, page, 'Relatório Executivo Pro (IA)', ctx, font, fontBold);

    // AI Section
    page.drawRectangle({ x: 36, y: y - 5, width: 520, height: 20, color: rgb(0.8, 0.9, 0.8) });
    page.drawText('Análise Inteligente', { x: 40, y, size: 12, font: fontBold, color: rgb(0, 0.3, 0) });
    y -= 25;

    // Wrap text logic simples
    const lines = analysis.split('\n');
    for (const para of lines) {
      if (!para.trim()) { y -= 10; continue; }
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        if (font.widthOfTextAtSize(line + w, 10) > 500) {
          page.drawText(line, { x: 36, y, size: 10, font, lineHeight: 14 });
          y -= 14;
          if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
          line = '';
        }
        line += w + ' ';
      }
      if (line) {
        page.drawText(line, { x: 36, y, size: 10, font, lineHeight: 14 });
        y -= 14;
      }
      y -= 6;
      if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
    }

    y -= 20;
    // Tabelas Resumidas
    const drawTable = (title, items) => {
      if (y < 100) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(title, { x: 36, y, size: 12, font: fontBold }); y -= 16;
      for (const item of items) {
        const txt = `${item[0].slice(0, 50)}: ${item[1].toFixed(2)}€`;
        page.drawText(txt, { x: 36, y, size: 9, font }); y -= 12;
      }
      y -= 12;
    }

    drawTable('Principais Fornecedores', Array.from(supMap).sort((a, b) => b[1] - a[1]).slice(0, 5));
    drawTable('Principais Clientes', Array.from(cusMap).sort((a, b) => b[1] - a[1]).slice(0, 5));

    const bytes = await doc.save();
    res.json({ ok: true, pdfBase64: Buffer.from(bytes).toString('base64') });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.stack || e.message });
  }
});

/* ========= Templates (Teacher) ========= */
app.get('/api/templates', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const listFile = path.join(ctx.dirs.templates, 'templates.json');
  ensureFile(listFile, JSON.stringify({ items: [] }, null, 2));
  const j = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  res.json({ items: j.items });
});
app.post('/api/templates', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { name, regions } = req.body || {};
  if (!name || !Array.isArray(regions)) return res.status(400).json({ error: 'name and regions[] required' });
  const listFile = path.join(ctx.dirs.templates, 'templates.json');
  ensureFile(listFile, JSON.stringify({ items: [] }, null, 2));
  const j = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const exist = j.items.findIndex(it => String(it.name).toLowerCase() === String(name).toLowerCase());
  const item = { name: String(name), regions, path: '' };
  if (exist >= 0) j.items[exist] = item; else j.items.push(item);
  fs.writeFileSync(listFile, JSON.stringify(j, null, 2));
  logAudit(ctx, 'template_save', { name, regionsCount: regions.length });
  res.json({ ok: true });
});

/* ========= App logo ========= */
app.post('/api/app-logo', (req, res) => {
  const ctx = ctxOf(req.query.project);
  const { dataUrl } = req.body || {};
  if (!dataUrl || !/^data:image\/png;base64,/.test(dataUrl)) return res.status(400).json({ error: 'PNG dataUrl required' });
  const b64 = dataUrl.split(',')[1];
  fs.writeFileSync(ctx.files.logo, Buffer.from(b64, 'base64'));
  res.json({ ok: true, path: ctx.files.logo });
});

/* ========= Static ========= */
app.use('/', express.static(path.resolve(__dirname, '../client/dist')));

/* ========= Helpers ========= */
function filterDocs(q, rows) {
  const { docType, supplier, customer, q: qq, dateFrom, dateTo, totalMin, status } = q || {};
  let out = [...rows];
  if (docType) out = out.filter(r => String(r.docType || '').toLowerCase() === String(docType).toLowerCase());
  if (status) out = out.filter(r => String(r.status || '').toLowerCase() === String(status).toLowerCase());
  if (supplier) out = out.filter(r => coercePartyToString(r.supplier).toLowerCase().includes(String(supplier).toLowerCase()));
  if (customer) out = out.filter(r => coercePartyToString(r.customer).toLowerCase().includes(String(customer).toLowerCase()));
  if (qq) { const ql = String(qq).toLowerCase(); out = out.filter(r => (r.docNumber || '').toLowerCase().includes(ql) || JSON.stringify(r).toLowerCase().includes(ql)); }
  if (dateFrom) out = out.filter(r => (r.date || '') >= dateFrom);
  if (dateTo) out = out.filter(r => (r.date || '') <= dateTo);
  if (totalMin) out = out.filter(r => (Number(r.total) || 0) >= Number(totalMin));
  return out;
}
function normalizeDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{1,2})[\/\.\-\s](\d{1,2})[\/\.\-\s](\d{4})$/);
  if (!m) return s; const [, d, mo, y] = m; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function toNumberEU(s) { if (!s) return 0; return Number(String(s).replace(/\./g, '').replace(',', '.').replace(/\s/g, '')) || 0; }
function biggestNear(text, tokenRe) {
  const idx = text.search(tokenRe); if (idx === -1) return '';
  const window = text.slice(Math.max(0, idx - 200), idx + 200);
  const nums = window.match(/\d{1,3}(?:[\.\s]\d{3})*(?:,\d+)?/g) || [];
  return nums.sort((a, b) => toNumberEU(b) - toNumberEU(a))[0] || '';
}
function guessDocType(text) {
  const t = text.toLowerCase();
  if (/nota\s*de\s*encomenda|pedido/.test(t)) return 'Encomenda';
  if (/propost|orcament|orçamento/.test(t)) return 'Proposta';
  if (/nota\s*de\s*cr[eé]dito|credit\s*note/.test(t)) return 'NotaCredito';
  if (/recibo|receipt/.test(t)) return 'Recibo';
  if (/fatura|factura|invoice|fattura/.test(t)) return 'Fatura';
  return 'Documento';
}
function extractHeuristic(text) {
  const norm = t => t?.trim().replace(/\s+/g, ' ') || '';
  const find = re => { const m = text.match(re); return m ? norm(m[1] || m[0]) : ''; };
  const supplier = find(/Fornecedor[:\s]*([^\n]{2,60})/i);
  const customer = find(/(?:Cliente|Customer|Bill\s*To)[:\-]?\s*([^\n]{2,60})/i);
  const docNumber = find(/\b(?:Fatura|Factura|Invoice|Fattura|Pedido|Encomenda|Proposta|Orcamento|Orçamento|No\.?|Nº|Nr\.?)\s*[:#]?\s*([A-Z0-9\-\/\.]{3,})/i);
  const date = normalizeDate(find(/\b(?:Data|Date|Emissão|Issued)\s*[:\-]?\s*([0-3]?\d[\/\-\.\s][01]?\d[\/\-\.\s][12]\d{3})/i));
  const dueDate = normalizeDate(find(/\b(?:Vencimento|Due\s*Date)\s*[:\-]?\s*([0-3]?\d[\/\-\.\s][01]?\d[\/\-\.\s][12]\d{3})/i));
  const total = toNumberEU(find(/(?:Total\s*(?:a\s*pagar|a pagar|pagar)?|Grand\s*Total)\s*[:€]?\s*([0-9\.\,\s]+)(?:€)?/i) || biggestNear(text, /Total/gi));
  const currency = /€|EUR/i.test(text) ? 'EUR' : (/USD|\$/i.test(text) ? 'USD' : '');
  const docType = find(/\b(?:Tipo\s*(?:de)?\s*Documento|Doc\.\s*Type)\s*[:\-]?\s*([A-Za-zÀ-ÿ ]{3,30})/i) || guessDocType(text);
  return { supplier, customer, docNumber, date, dueDate, total, currency, docType, meta: {} };
}
async function extractWithAI(openai, text) {
  const prompt = [
    { role: 'system', content: 'Extrai campos de documentos financeiros em PT. Responde apenas JSON.' },
    {
      role: 'user', content:
        `Extrai JSON com: docType, docNumber, date(YYYY-MM-DD), dueDate(YYYY-MM-DD),
supplier(string|obj), customer(string|obj), total(number), currency.
Normaliza PT ("1.234,56"->1234.56). Prefere "TOTAL A PAGAR".
TEXTO:
${text.slice(0, 16000)}`
    }];
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const r = await openai.chat.completions.create({ model, messages: prompt, temperature: 0.1, response_format: { type: 'json_object' } });
  const raw = (r.choices?.[0]?.message?.content || '{}').trim();
  const j = JSON.parse(raw || '{}');
  j.date = normalizeDate(j.date || ''); j.dueDate = normalizeDate(j.dueDate || '');
  j.supplier = coercePartyToString(j.supplier); j.customer = coercePartyToString(j.customer);
  j.total = Number(j.total) || 0; j.currency = j.currency || 'EUR'; j.docType = j.docType || ''; j.docNumber = j.docNumber || '';
  return j;
}
function getJson(kind, ctx) {
  // util simples p/ reusar agregações sem HTTP interno
  if (kind.includes('suppliers')) {
    const rows = filterDocs({}, ctx.readJSON('docs').rows);
    const map = new Map();
    for (const r of rows) { const k = coercePartyToString(r.supplier || '') || '(vazio)'; map.set(k, (map.get(k) || 0) + (Number(r.total) || 0)); }
    return Array.from(map, ([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
  }
  if (kind.includes('customers')) {
    const rows = filterDocs({}, ctx.readJSON('docs').rows);
    const map = new Map();
    for (const r of rows) { const k = coercePartyToString(r.customer || '') || '(vazio)'; map.set(k, (map.get(k) || 0) + (Number(r.total) || 0)); }
    return Array.from(map, ([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
  }
  if (kind.includes('monthly')) {
    const rows = filterDocs({}, ctx.readJSON('docs').rows);
    const map = new Map();
    for (const r of rows) { const m = (String(r.date || '').slice(0, 7)) || '(sem data)'; map.set(m, (map.get(m) || 0) + (Number(r.total) || 0)); }
    return Array.from(map, ([key, total]) => ({ key, total })).sort((a, b) => a.key.localeCompare(b.key));
  }
  return [];
}
function safeCsv(s) { const t = String(s || ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }

function loadTypesAndSynonyms(ctx) {
  const typesRaw = JSON.parse(fs.readFileSync(ctx.files.doctypes, 'utf8'));
  const types = Array.isArray(typesRaw.items) ? typesRaw.items : [];
  const syn = JSON.parse(fs.readFileSync(ctx.files.synonyms, 'utf8'));
  const map = {};
  // Canonical → ele próprio
  types.forEach(t => { map[String(t).toLowerCase()] = t; });
  // Synonyms → canonical
  for (const [canon, arr] of Object.entries(syn || {})) {
    (arr || []).forEach(s => {
      const k = String(s).toLowerCase();
      if (!map[k]) map[k] = canon;
    });
    const kCanon = String(canon).toLowerCase();
    if (!map[kCanon]) map[kCanon] = canon;
  }
  return { types, map };
}
function normalizeDocTypeValue(ctx, raw) {
  const { types, map } = loadTypesAndSynonyms(ctx);
  const r = String(raw || '').trim();
  if (!r) return { value: '', canonical: '', types };
  const guess = map[String(r).toLowerCase()];
  if (guess) return { value: guess, canonical: guess, types };
  // heurística fallback: usa guessDocType sobre a string
  const g = guessDocType(r);
  const g2 = map[String(g).toLowerCase()] || g;
  return { value: g2, canonical: g2, types };
}

function ensureArchiveDest(ctx, docType, docNumber) {
  const now = new Date(); const yyyy = String(now.getFullYear()); const mm = String(now.getMonth() + 1).padStart(2, '0');
  const outDir = path.join(ctx.dirs.archive, yyyy, mm);
  fs.mkdirSync(outDir, { recursive: true });
  return path.join(outDir, `${sanitize(docType)}-${sanitize(docNumber)}.pdf`);
}
function checkDuplicate(db, id, docType, docNumber) {
  return db.rows.find(r =>
    r.id !== id &&
    r.status === 'processado' &&
    String(r.docType || '').toLowerCase() === String(docType).toLowerCase() &&
    String(r.docNumber || '').toLowerCase() === String(docNumber).toLowerCase()
  );
}
async function optimizeAndWritePdf(srcPath, destPath) {
  const bytes = fs.readFileSync(srcPath);
  const doc = await PDFDocument.load(bytes);
  const saved = await doc.save({ useObjectStreams: true });
  fs.writeFileSync(destPath, Buffer.from(saved));
}


/* ========= Start ========= */
const PORT = 3000; const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`Invoice Studio on http://${HOST}:${PORT}`));
