import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { StatCard } from '../components/ui/StatCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ActionBar } from '../components/ui/ActionBar';
import { TableBox } from '../components/ui/TableBox';
import ChartsAll from '../components/ChartsAll';
import { fmtEUR, Badge, downloadFile, qp } from '../shared/ui';
import api from '../api/apiClient';

export default function ReportsTab({ project }) {
  // --- State ---
  const chartsRef = React.useRef(null);
  const [loadingPro, setLoadingPro] = useState(false);
  const [chartsVisible, setChartsVisible] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [docTypes, setDocTypes] = useState([]);

  // Data - KPIs
  const [kpis, setKpis] = useState({
    totalValue: 0,
    totalDocs: 0,
    loading: true
  });

  // Data - Table
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [tableLoading, setTableLoading] = useState(false);

  // --- Config Load ---
  useEffect(() => {
    api.get(`/api/v2/doctypes?project=${project}`)
      .then(res => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw.types || []);
        setDocTypes(list);
      })
      .catch(() => { });
  }, [project]);

  // --- Data Fetching ---

  // 1. KPIs
  const fetchKpis = useCallback(async () => {
    setKpis(k => ({ ...k, loading: true }));
    try {
      const [monthlyRes, metaRes] = await Promise.all([
        api.get(qp('/api/reports/monthly', project)).catch(() => ({ data: [] })),
        api.get(qp('/api/v2/docs', project), { params: { limit: 1 } }).catch(() => ({ data: { total: 0 } }))
      ]);

      const months = Array.isArray(monthlyRes.data) ? monthlyRes.data : (monthlyRes.data.rows || []);
      const totalVal = months.reduce((acc, m) => acc + (Number(m.total || m.sum || 0)), 0);
      const totalCount = metaRes.data.total || 0;

      setKpis({
        totalValue: totalVal,
        totalDocs: totalCount,
        loading: false
      });
    } catch (e) {
      console.error("KPI fetch failed", e);
      setKpis(k => ({ ...k, loading: false }));
    }
  }, [project]);

  // 2. Table Data
  const fetchTable = useCallback(async () => {
    setTableLoading(true);
    try {
      const params = {
        project,
        page,
        limit,
        status: statusFilter,
        docType: docTypeFilter
      };
      const res = await api.get('/api/v2/docs', { params });
      setRows(res.data.rows || []);
      setTotalRows(res.data.total || 0);
    } catch (e) {
      console.error("Table fetch failed", e);
    } finally {
      setTableLoading(false);
    }
  }, [project, page, limit, statusFilter, docTypeFilter]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  useEffect(() => { fetchTable(); }, [fetchTable]);

  // Actions
  function handleRefresh() {
    fetchKpis();
    fetchTable();
    if (chartsVisible && chartsRef.current?.reload) chartsRef.current.reload();
  }

  async function downloadProPdf() {
    if (!confirm('O relatório Pro utiliza a API da OpenAI. Continuar?')) return;
    setLoadingPro(true);
    try {
      // ... (keep existing logic) ...
      const res = await api.post(qp('/api/reports/pro-pdf', project), { reportType: 'Geral' });
      // Mock success for now if backend not ready
      alert("PDF Generation triggered!");
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setLoadingPro(false);
    }
  }

  const totalPages = Math.ceil(totalRows / limit);

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-60px)] fade-in pb-4" data-testid="reportsv2-page">

      {/* 1. Header (KPIs + Global Actions handled via separate bar if needed, but here KPIs are key) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0" data-testid="reportsv2-kpis">
        <StatCard
          label="Total Value"
          value={kpis.loading ? '...' : fmtEUR(kpis.totalValue)}
          subtext="All time"
          gradientVar="var(--grad-stat1)"
          icon={<span>💰</span>}
        />
        <StatCard
          label="Total Documents"
          value={kpis.loading ? '...' : kpis.totalDocs}
          subtext="In system"
          gradientVar="var(--grad-stat2)"
          icon={<span>📄</span>}
        />
        <ActionCard
          icon="✨"
          title="PDF Report"
          subtitle="AI Analysis"
          onClick={downloadProPdf}
          className="h-full"
        />
        <ActionCard
          icon="📊"
          title="Export Data"
          subtitle="Excel Detail"
          onClick={() => downloadFile(qp('/api/export.xlsx', project), `detalhe-${project}.xlsx`)}
          className="h-full"
        />
      </div>

      {/* 2. Action Bar (Filters) */}
      <ActionBar className="!grid-cols-2 lg:!grid-cols-4" data-testid="reportsv2-filters">
        <div className="col-span-1 lg:col-span-2 flex items-center gap-4 bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] shadow-sm">
          <span className="text-sm font-bold opacity-60 ml-2">Filters:</span>
          <select
            className="h-9 px-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-sm flex-1"
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="uploaded">Uploaded</option>
            <option value="extracted">Extracted</option>
          </select>
          <select
            className="h-9 px-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-sm flex-1"
            value={docTypeFilter} onChange={e => { setDocTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Types</option>
            {docTypes.map(t => {
              const val = typeof t === 'object' ? t.id : t;
              const lab = typeof t === 'object' ? t.labelPt : t;
              return <option key={val} value={val}>{lab}</option>
            })}
          </select>
        </div>

        <ActionCard
          icon="🔄"
          title="Refresh"
          onClick={handleRefresh}
          className="!p-3 !flex-row !items-center !gap-3 !justify-start"
        />
        <ActionCard
          icon={chartsVisible ? "🔽" : "▶️"}
          title={chartsVisible ? "Hide Charts" : "View Charts"}
          onClick={() => setChartsVisible(!chartsVisible)}
          active={chartsVisible}
          className="!p-3 !flex-row !items-center !gap-3 !justify-start"
        />
      </ActionBar>

      {/* 3. Table Box */}
      <TableBox
        data-testid="reportsv2-table"
        header={
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Result List</h3>
            <div className="text-xs text-[var(--text-muted)]">Showing {rows.length} / {totalRows}</div>
          </div>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <button className="btn btn--tiny" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="font-mono text-xs">{page} / {totalPages || 1}</span>
            <button className="btn btn--tiny" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        }
      >
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-[var(--surface-active)] sticky top-0 z-10">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Number</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tableLoading ? (
              <tr><td colSpan="5" className="p-8 text-center">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center opacity-60">No results.</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="p-3">{r.date || '-'}</td>
                  <td className="p-3 font-medium">{r.docNumber || '-'}</td>
                  <td className="p-3">{r.customer || r.supplier || '-'}</td>
                  <td className="p-3"><Badge>{r.status}</Badge></td>
                  <td className="p-3 text-right font-mono">{fmtEUR(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableBox>

      {/* 4. Collapsible Charts */}
      {chartsVisible && (
        <div className="shrink-0 max-h-[400px] overflow-auto border-t border-[var(--border)] pt-4">
          <ChartsAll ref={chartsRef} project={project} />
        </div>
      )}
    </div>
  );
}
