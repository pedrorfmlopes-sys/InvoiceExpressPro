// client/src/tabs/ReportsTab.jsx
import React from 'react'
import ChartsAll from '../components/ChartsAll'
import { qp } from '../shared/ui'

export default function ReportsTab({ project }) {
  const chartsRef = React.useRef(null)
  const [loadingPro, setLoadingPro] = React.useState(false);

  async function downloadProPdf() {
    if (!confirm('O relatório Pro utiliza a API da OpenAI para gerar uma análise inteligente. Continuar?')) return;
    setLoadingPro(true);
    try {
      const apiKey = localStorage.getItem('OPENAI_API_KEY') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-OpenAI-Key'] = apiKey;

      const res = await fetch(qp('/api/reports/pro-pdf', project), {
        method: 'POST',
        headers,
        body: JSON.stringify({ reportType: 'Geral' })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const a = document.createElement('a');
      a.href = `data:application/pdf;base64,${data.pdfBase64}`;
      a.download = `relatorio_pro_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setLoadingPro(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card__title">Exportações</div>
        <div className="row">
          <div className="muted">CSV, XLSX (relatórios e detalhe) e PDF.</div>
          <div style={{ justifySelf: 'end', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => window.location.href = qp('/api/export.csv', project)}>CSV</button>
            <button className="btn" onClick={() => window.location.href = qp('/api/reports.xlsx', project)}>XLSX Relatórios</button>
            <button className="btn" onClick={() => window.location.href = qp('/api/export.xlsx', project)}>XLSX Detalhe</button>
            <div className="splitter" style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
            <button className="btn" onClick={() => window.location.href = qp('/api/reports.pdf', project)}>PDF Básico</button>
            <button className="btn primary" disabled={loadingPro} onClick={downloadProPdf}>
              {loadingPro ? 'A gerar...' : 'PDF Pro (IA)'}
            </button>
            <button className="btn" onClick={() => chartsRef.current?.reload?.()}>Atualizar</button>
          </div>
        </div>
      </div>
      <ChartsAll ref={chartsRef} project={project} />
    </>
  )
}
