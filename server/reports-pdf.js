// path: server/reports-pdf.js
// Relatório PDF em A4 portrait, com cabeçalho/rodapé, tabelas com TOTAL.
// Usa pdf-lib. Suporta logo da app (PNG) se fornecido via opts.appLogoPath.

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function fmtEUR(n) {
  const v = Number.isFinite(+n) ? +n : 0;
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

// Sanear caracteres fora de WinAnsi + substituir € por EUR
function safeText(s) {
  const map = {
    '€':'EUR','•':'*','–':'-','—':'-','−':'-','…':'...','’':"'",'‘':"'",'“':'"','”':'"',
    '→':'->','⇒':'=>','«':'"','»':'"','º':'o','ª':'a'
  };
  return String(s ?? '')
    .replace(/[\u20AC\u2022\u2013\u2014\u2212\u2026\u2019\u2018\u201C\u201D\u2192\u21D2\u00AB\u00BB\u00BA\u00AA]/g, m => map[m] || '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
}

async function embedOptionalPng(pdf, p) {
  try {
    if (!p) return null;
    if (!fs.existsSync(p)) return null;
    const bytes = fs.readFileSync(p);
    return await pdf.embedPng(bytes);
  } catch { return null; }
}

async function buildPDF({ 
  title, suppliers = [], monthly = [], customers = [], analysis = "", appLogoPath = null 
}) {
  // A4 portrait: 595 x 842
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 36;

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedOptionalPng(pdf, appLogoPath);

  let y = height - margin;

  function drawText(txt, x, size, f = font, color = rgb(0.1,0.1,0.12)) {
    page.drawText(safeText(txt), { x, y: y - size, size, font: f, color });
  }

  function header() {
    const h = 48;
    page.drawLine({ start: {x: margin, y: height - h}, end: {x: width - margin, y: height - h}, thickness: 0.5, color: rgb(0.8,0.8,0.85) });
    if (logo) {
      const w = 90, ratio = logo.height / logo.width, hh = w * ratio;
      page.drawImage(logo, { x: margin, y: height - h + (h - hh)/2, width: w, height: hh });
    }
    page.drawText(safeText(title || 'Relatórios de Faturas'), { x: logo ? margin + 100 : margin, y: height - h + 16, size: 16, font: fontB, color: rgb(0.1,0.1,0.12) });
    y = height - h - 16;
  }

  function footer() {
    const ts = new Date().toLocaleString('pt-PT');
    const txt = `Gerado em ${ts} • Página 1/1`; // (1 página – mantemos simples)
    page.drawLine({ start: {x: margin, y: margin + 18}, end: {x: width - margin, y: margin + 18}, thickness: 0.5, color: rgb(0.8,0.8,0.85) });
    page.drawText(safeText(txt), { x: margin, y: margin + 6, size: 10, font, color: rgb(0.35,0.35,0.4) });
  }

  function titleLine(t) { drawText(t, margin, 16, fontB); y -= 24; }
  function subLine(t)   { drawText(t, margin, 11, font, rgb(0.35,0.35,0.4)); y -= 16; }

  function table(headers, rows, widths, opts = {}) {
    const lh = 16;
    // cabeçalho
    let x = margin;
    headers.forEach((h, i) => { page.drawText(safeText(h), { x, y: y - 12, size: 11, font: fontB }); x += widths[i]; });
    y -= lh;

    // linhas
    rows.forEach(row => {
      let xx = margin;
      headers.forEach((key, i) => {
        page.drawText(safeText(String(row[key] ?? '')), { x: xx, y: y - 12, size: 10, font });
        xx += widths[i];
      });
      y -= lh;
    });

    if (opts.total != null) {
      let xt = margin;
      for (let i = 0; i < headers.length - 1; i++) xt += widths[i];
      page.drawText('TOTAL', { x: xt - 60, y: y - 12, size: 10, font: fontB });
      page.drawText(safeText(fmtEUR(opts.total)), { x: xt + 8, y: y - 12, size: 10, font: fontB });
      y -= lh;
    }
    y -= 12;
  }

  const totalSup = suppliers.reduce((a, r) => a + (+r.sum || 0), 0);
  const totalCus = customers.reduce((a, r) => a + (+r.sum || 0), 0);
  const totalMon = monthly.reduce((a, r) => a + (+r.sum || 0), 0);

  header();

  subLine(`Fornecedores: ${fmtEUR(totalSup)} • Clientes: ${fmtEUR(totalCus)} • Soma Meses: ${fmtEUR(totalMon)}`);
  if (analysis) subLine(`Análise IA: ${analysis}`);

  titleLine('Top Fornecedores');
  const supRows = [...suppliers]
    .sort((a,b)=>(+b.sum||0)-(+a.sum||0))
    .slice(0, 20)
    .map(r => ({ 'Fornecedor': r.Fornecedor, 'Faturas': r.count, 'Total': fmtEUR(+r.sum||0) }));
  table(['Fornecedor','Faturas','Total'], supRows, [330, 80, 100], { total: totalSup });

  titleLine('Top Clientes');
  const cusRows = [...customers]
    .sort((a,b)=>(+b.sum||0)-(+a.sum||0))
    .slice(0, 20)
    .map(r => ({ 'Cliente': r.Cliente, 'Faturas': r.count, 'Total': fmtEUR(+r.sum||0) }));
  table(['Cliente','Faturas','Total'], cusRows, [330, 80, 100], { total: totalCus });

  titleLine('Total por Mês');
  const monRows = [...monthly]
    .sort((a,b)=>String(a.month).localeCompare(String(b.month)))
    .map(r => ({ 'Mês': r.month, 'Faturas': r.count, 'Total': fmtEUR(+r.sum||0) }));
  table(['Mês','Faturas','Total'], monRows, [120, 80, 120], { total: totalMon });

  footer();

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

module.exports = { buildPDF };
