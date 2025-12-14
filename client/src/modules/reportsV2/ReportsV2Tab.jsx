import React from 'react';
import { ReportsV2Api } from './api';
import { fmtEUR, CollapsibleCard, saveNodeAsPng } from '../../shared/ui';

export default function ReportsV2Tab({ project }) {
    const [summary, setSummary] = React.useState(null);
    const [suppliers, setSuppliers] = React.useState([]);
    const [customers, setCustomers] = React.useState([]);
    const [monthly, setMonthly] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    // Refs for PNG export
    const refSup = React.useRef(null);
    const refCus = React.useRef(null);
    const refMon = React.useRef(null);

    async function load() {
        setLoading(true);
        try {
            const [s, sup, cus, mon] = await Promise.all([
                ReportsV2Api.getSummary(project),
                ReportsV2Api.getTopSuppliers(project),
                ReportsV2Api.getTopCustomers(project),
                ReportsV2Api.getMonthlyTotals(project)
            ]);
            setSummary(s?.rows?.[0] || null);
            setSuppliers(sup?.rows || []);
            setCustomers(cus?.rows || []);
            setMonthly(mon?.rows || []);
        } catch (e) {
            console.error(e);
            alert('Falha ao carregar Relatórios V2');
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => { load(); }, [project]);

    // Simple Renderers reusing Logic from ChartsAll but simplified styles
    const BarChart = ({ rows, labelKey, valKey, max, color = 'var(--text)' }) => (
        <div className="chart chart--h">
            {rows.map((r, i) => (
                <div className="bar-row" key={i}>
                    <div className="bar-label" title={r[labelKey]}>{r[labelKey]}</div>
                    <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(r[valKey] / max) * 100}%`, background: color }} />
                    </div>
                    <div className="bar-value">{fmtEUR(r[valKey])}</div>
                </div>
            ))}
            {!rows.length && <div className="muted p-4 text-center">Sem dados</div>}
        </div>
    );

    const supMax = Math.max(1, ...suppliers.map(x => x.total));
    const cusMax = Math.max(1, ...customers.map(x => x.total));
    const monMax = Math.max(1, ...monthly.map(x => x.total));

    return (
        <div className="animate-fade-in">
            {/* Toolbar */}
            <div className="card mb-4">
                <div className="row items-center">
                    <div>
                        <h2 className="text-lg font-bold m-0">Relatórios V2 <span className="badge">Modular</span></h2>
                        <div className="muted text-sm">Motor v2.0.0 • Strict Contract</div>
                    </div>
                    <div className="row gap-2" style={{ marginLeft: 'auto' }}>
                        <button className="btn" onClick={() => ReportsV2Api.downloadExport(project)}>XLSX</button>
                        <div className="splitter mx-2" />
                        <button className="btn" onClick={() => ReportsV2Api.downloadPdfBasic(project)}>PDF Básico</button>
                        <button className="btn primary" onClick={() => alert('Feature Pro pendente (Phase 3.1)')} title="Requer entitlement reports_pdf_pro">PDF Pro (IA)</button>
                        <button className="btn" onClick={load} disabled={loading}>{loading ? '...' : '⟳'}</button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid-4 gap-4 mb-4">
                <div className="card text-center py-4">
                    <div className="muted text-sm uppercase">Total Global</div>
                    <div className="text-2xl font-mono mt-2">{summary ? fmtEUR(summary.total) : '...'}</div>
                </div>
                <div className="card text-center py-4">
                    <div className="muted text-sm uppercase">Faturas</div>
                    <div className="text-xl font-mono mt-2">{summary ? summary.count : '...'}</div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid-2 gap-4">
                {/* Top Suppliers */}
                <div className="card" ref={refSup}>
                    <div className="row items-center mb-2">
                        <h3 className="m-0 text-md">Top Fornecedores</h3>
                        <button className="btn btn--tiny" onClick={() => saveNodeAsPng(refSup.current, 'top-sup.png')}>[PNG]</button>
                    </div>
                    <BarChart rows={suppliers} labelKey="name" valKey="total" max={supMax} color="var(--primary)" />
                </div>

                {/* Top Customers */}
                <div className="card" ref={refCus}>
                    <div className="row items-center mb-2">
                        <h3 className="m-0 text-md">Top Clientes</h3>
                        <button className="btn btn--tiny" onClick={() => saveNodeAsPng(refCus.current, 'top-cus.png')}>[PNG]</button>
                    </div>
                    <BarChart rows={customers} labelKey="name" valKey="total" max={cusMax} color="var(--accent)" />
                </div>
            </div>

            {/* Monthly Full Width */}
            <CollapsibleCard title="Evolução Mensal" className="mt-4" initialOpen={true}>
                <div className="chart chart--v h-64 mt-4" ref={refMon}>
                    {monthly.map((m, i) => (
                        <div className="bar-col" key={i} title={`${m.month}: ${fmtEUR(m.total)}`}>
                            <div className="bar bar--v" style={{ height: `${(m.total / monMax) * 100}%` }} />
                            <div className="bar-x">{m.month}</div>
                        </div>
                    ))}
                    {!monthly.length && <div className="muted text-center w-full pt-10">Sem histórico</div>}
                </div>
            </CollapsibleCard>
        </div>
    );
}
