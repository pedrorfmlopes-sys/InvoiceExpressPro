// client/src/components/ChartsAll.jsx
import React from 'react'
import { CollapsibleCard, fmtEUR, qp, saveNodeAsPng } from '../shared/ui'

const ChartsAll = React.forwardRef(function ChartsAll({ project }, ref) {
  const [suppliers, setSuppliers] = React.useState([])
  const [monthly, setMonthly] = React.useState([])
  const [customers, setCustomers] = React.useState([])
  const [totals, setTotals] = React.useState({ sup: 0, mon: 0, cus: 0, rowsSup: 0, rowsMon: 0, rowsCus: 0 })
  const refSup = React.useRef(null), refMon = React.useRef(null), refCus = React.useRef(null)

  async function load() {
    const [a, b, c] = await Promise.all([
      fetch(qp('/api/reports/suppliers', project)).then(r => r.json()),
      fetch(qp('/api/reports/monthly', project)).then(r => r.json()),
      fetch(qp('/api/reports/customers', project)).then(r => r.json()),
    ]).catch(() => [[], [], []])
    const sup = Array.isArray(a) ? a : (a.rows || [])
    const mon = Array.isArray(b) ? b : (b.rows || [])
    const cus = Array.isArray(c) ? c : (c.rows || [])
    setSuppliers(sup); setMonthly(mon); setCustomers(cus)
    setTotals({
      sup: sup.reduce((s, x) => s + (Number(x.total || x.sum || 0)), 0), rowsSup: sup.length,
      mon: mon.reduce((s, x) => s + (Number(x.total || x.sum || 0)), 0), rowsMon: mon.length,
      cus: cus.reduce((s, x) => s + (Number(x.total || x.sum || 0)), 0), rowsCus: cus.length,
    })
  }
  React.useEffect(() => { load(); const onR = () => load(); window.addEventListener('reports-refresh', onR); return () => window.removeEventListener('reports-refresh', onR) }, [project])
  React.useImperativeHandle(ref, () => ({ reload: load }))

  const supTop = React.useMemo(() => { const s = [...suppliers].sort((x, y) => Number((y.total ?? y.sum) || 0) - Number((x.total ?? x.sum) || 0)).slice(0, 10); const max = Math.max(1, ...s.map(x => Number((x.total ?? x.sum) || 0))); return { data: s, max, sum: s.reduce((a, r) => a + (Number((r.total ?? r.sum) || 0)), 0) } }, [suppliers])
  const monAgg = React.useMemo(() => { const max = Math.max(1, ...monthly.map(x => Number((x.total ?? x.sum) || 0))); return { data: monthly.map(m => ({ month: m.key || m.Mes || m.month, sum: Number((m.total ?? m.sum) || 0) })), max, sum: monthly.reduce((a, r) => a + (Number((r.total ?? r.sum) || 0)), 0) } }, [monthly])
  const cusTop = React.useMemo(() => { const s = [...customers].sort((x, y) => Number((y.total ?? y.sum) || 0) - Number((x.total ?? x.sum) || 0)).slice(0, 10); const max = Math.max(1, ...s.map(x => Number((x.total ?? x.sum) || 0))); return { data: s, max, sum: s.reduce((a, r) => a + (Number((r.total ?? r.sum) || 0)), 0) } }, [customers])

  function ChartH({ rows, labelKey, valueKey, max, innerRef }) {
    return (
      <div>
        <div className="chart chart--h" ref={innerRef}>
          {rows.map((r, i) => (
            <div className="bar-row" key={i}>
              <div className="bar-label" title={r[labelKey]}>{r[labelKey]}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${((Number(r[valueKey] || 0)) / max) * 100}%` }} />
              </div>
              <div className="bar-value">{fmtEUR(Number(r[valueKey] || 0))}</div>
            </div>
          ))}
          {!rows.length && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Sem dados para apresentar.</div>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid-2 mt-16">
        <div className="card">
          <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <div className="card__title" style={{ margin: 0 }}>Top 10 Fornecedores</div>
            <button className="btn btn--tiny" onClick={() => saveNodeAsPng(refSup.current, 'Top 10 Fornecedores')}>[PNG]</button>
          </div>
          <ChartH innerRef={refSup} rows={supTop.data.map(d => ({ Fornecedor: d.key || d.Fornecedor, sum: Number((d.total ?? d.sum) || 0) }))} labelKey="Fornecedor" valueKey="sum" max={supTop.max} />
        </div>

        <CollapsibleCard
          title="Total por mês"
          exportNodeRef={refMon}
          exportName="Total por mês"
          initialOpen={false}
          footer={<div className="card__footer"><b>Total (soma meses visíveis):</b> {fmtEUR(monAgg.sum)}</div>}
        >
          <div className="chart chart--v" ref={refMon}>
            {monAgg.data.map((r, i) => (
              <div className="bar-col" key={i} title={`${r.month} • ${fmtEUR(Number(r.sum || 0))}`}>
                <div className="bar bar--v" style={{ height: `${((Number(r.sum || 0)) / monAgg.max) * 100}%` }} />
                <div className="bar-x">{r.month}</div>
              </div>
            ))}
            {!monAgg.data.length && <div className="muted">Sem dados</div>}
          </div>
        </CollapsibleCard>

        <div className="card">
          <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <div className="card__title" style={{ margin: 0 }}>Top 10 Clientes</div>
            <button className="btn btn--tiny" onClick={() => saveNodeAsPng(refCus.current, 'Top 10 Clientes')}>[PNG]</button>
          </div>
          <ChartH innerRef={refCus} rows={cusTop.data.map(d => ({ Cliente: d.key || d.Cliente, sum: Number((d.total ?? d.sum) || 0) }))} labelKey="Cliente" valueKey="sum" max={cusTop.max} />
        </div>
      </div>

      <div className="card mt-16">
        <div className="row">
          <div><b>Total Fornecedores (todos):</b> {fmtEUR(totals.sup)}</div>
          <div><b>Total (todos os meses):</b> {fmtEUR(totals.mon)}</div>
          <div><b>Total Clientes (todos):</b> {fmtEUR(totals.cus)}</div>
          <div><b># Registos:</b> {totals.rowsSup}</div>
        </div>
      </div>
    </>
  )
})

export default ChartsAll
