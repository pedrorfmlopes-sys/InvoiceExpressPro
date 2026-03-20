import React, { useState, useEffect } from 'react';
import { StatCard } from '../components/ui/StatCard';
import { GlassCard } from '../components/ui/GlassCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ActionBar } from '../components/ui/ActionBar';
import ChartsAll from '../components/ChartsAll';
import { qp, downloadFile, fmtEUR } from '../shared/ui';
import api from '../api/apiClient';

export default function DashboardNew({ project }) {
    const chartsRef = React.useRef(null);
    const [loadingPro, setLoadingPro] = useState(false);
    const [showCharts, setShowCharts] = useState(false);

    // Data States
    const [recentDocs, setRecentDocs] = useState([]);

    // Health States
    const [health, setHealth] = useState({ ok: true, modules: [] });
    const [healthLoading, setHealthLoading] = useState(true);
    const [healthError, setHealthError] = useState(null);

    // Dashboard Stats State
    const [stats, setStats] = useState({
        monthRevenue: 0,
        pendingCount: 0,
        accuracy: 0,
        connections: 0
    });
    const [statsLoading, setStatsLoading] = useState(true);

    // Global Analytics (Profit / Margin)
    const [analytics, setAnalytics] = useState({
        profit: 0,
        marginPercent: 0
    });
    const [analyticsLoading, setAnalyticsLoading] = useState(true);

    // Load Data
    useEffect(() => {
        // 1. Load Recent Docs (Using CoreV2 Endpoint)
        api.get(`/api/corev2/docs?project=${project}&limit=5`)
            .then(res => setRecentDocs(res.data.rows || []))
            .catch(err => console.error("Recent docs failed", err));

        // 2. Load Dashboard Stats
        setStatsLoading(true);
        api.get(`/api/v2/reports/summary?project=${project}`)
            .then(res => {
                const globalData = (res.data.rows || [])[0] || {};
                setStats({
                    monthRevenue: globalData.monthRevenue || 0,
                    pendingCount: globalData.pendingCount || 0,
                    accuracy: globalData.accuracy || 0,
                    connections: globalData.connections || 0
                });
                setStatsLoading(false);
            })
            .catch(err => {
                console.error("Stats fetch failed", err);
                setStatsLoading(false);
            });

        // 3. Load Health
        setHealthLoading(true);
        api.get('/api/health/modules')
            .then(res => {
                setHealth({ ok: true, modules: res.data.modules || [] });
                setHealthLoading(false);
            })
            .catch(err => {
                console.error("Health check failed", err);
                setHealth({ ok: false, modules: [] });
                setHealthError(err.message);
                setHealthLoading(false);
            });

        // 4. Load Global Analytics (Profit & Margin)
        setAnalyticsLoading(true);
        api.get('/api/reconciliation/analytics')
            .then(res => {
                const data = res.data;
                if (data && data.realized && data.realized.margin) {
                    setAnalytics({
                        profit: data.realized.margin.net || 0,
                        marginPercent: data.realized.margin.percent || 0
                    });
                }
                setAnalyticsLoading(false);
            })
            .catch(err => {
                console.error("Global analytics fetch failed", err);
                setAnalyticsLoading(false);
            });

    }, [project]);

    // Helpers
    async function downloadProPdf() {
        if (!confirm('O relatório Pro utiliza a API da OpenAI. Continuar?')) return;
        setLoadingPro(true);
        try {
            const res = await api.post(qp('/api/reports/pro-pdf', project), { reportType: 'Geral' });
            alert("PDF Generation triggered!"); // Mock success
        } catch (e) {
            alert('Erro: ' + e.message);
        } finally {
            setLoadingPro(false);
        }
    }

    // Render Helpers
    const getStatusColor = (status) => {
        if (status === 'processado') return 'text-[var(--success-fg)]';
        if (status === 'error') return 'text-[var(--error-fg)]';
        return 'text-[var(--text-muted)]';
    };

    const getHealthIcon = (m) => {
        // Logic: closed=true means STABLE (Green), closed=false means OPEN/DEV (Amber)
        if (!m.closed) return '⚠️'; // Amber/Warn
        return '✅'; // Green/Stable
    };

    return (
        <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar">

            {/* 1. Header & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 shrink-0">
                <StatCard
                    label="Receita do Mês"
                    value={fmtEUR(stats.monthRevenue)}
                    subtext="Valores extraídos"
                    gradientVar="var(--grad-stat1)"
                    icon={<span>💰</span>}
                    loading={statsLoading}
                />
                <StatCard
                    label="Lucro (Real)"
                    value={fmtEUR(analytics.profit)}
                    subtext="Todas as marcas"
                    gradientVar="var(--grad-stat2)"
                    icon={<span>📈</span>}
                    loading={analyticsLoading}
                />
                <StatCard
                    label="Margem (Real)"
                    value={`${analytics.marginPercent.toFixed(1)}%`}
                    subtext="Todas as marcas"
                    gradientVar="var(--grad-stat1)"
                    icon={<span>🎯</span>}
                    loading={analyticsLoading}
                />
                <StatCard
                    label="Docs Pendentes"
                    value={stats.pendingCount}
                    subtext="A aguardar revisão"
                    gradientVar="var(--grad-stat2)"
                    icon={<span>⏳</span>}
                    loading={statsLoading}
                />
                <StatCard
                    label="Precisão AI"
                    value={`${stats.accuracy}%`}
                    subtext="Média global"
                    gradientVar="var(--grad-stat1)"
                    icon={<span>🤖</span>}
                    loading={statsLoading}
                />
                <StatCard
                    label="Ligações Ativas"
                    value={stats.connections}
                    subtext="Entidades detectadas"
                    gradientVar="var(--grad-stat2)"
                    icon={<span>🔗</span>}
                    loading={statsLoading}
                />
            </div>

            {/* 2. Action Bar */}
            <ActionBar>
                <ActionCard
                    icon="📤"
                    title="Novo Upload"
                    subtitle="Arraste ou clique"
                    onClick={() => document.querySelector('[data-testid=corev2-dropzone]')?.scrollIntoView({ behavior: 'smooth' })}
                />
                <ActionCard
                    icon="✨"
                    title="Relatório IA"
                    subtitle="Gerar análise PDF"
                    onClick={downloadProPdf}
                />
                <ActionCard
                    icon="📊"
                    title={showCharts ? "Ocultar Gráficos" : "Ver Gráficos"}
                    subtitle="Alternar visualização"
                    onClick={() => setShowCharts(!showCharts)}
                    active={showCharts}
                />
                <ActionCard
                    icon="⚙️"
                    title="Definições"
                    onClick={() => alert("Settings")}
                />
                <ActionCard
                    icon="❓"
                    title="Ajuda"
                    onClick={() => alert("Help Center")}
                />
            </ActionBar>

            {/* 3. Main Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">

                {/* Recent Documents */}
                <GlassCard className="col-span-1 xl:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">Documentos Recentes</h3>
                        <button className="text-xs text-[var(--accent-primary)] hover:underline">Ver Todos</button>
                    </div>
                    <div className="flex flex-col gap-0 divide-y divide-[var(--border)]">
                        {recentDocs.length === 0 ? (
                            <div className="p-8 text-center text-[var(--text-muted)] opacity-60">
                                Nenhum documento recente.
                            </div>
                        ) : (
                            recentDocs.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between py-3 hover:bg-[var(--surface-hover)] transition-colors px-2 -mx-2 rounded-lg group">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="font-medium text-sm">{doc.docNumber || 'Sem Num.'}</div>
                                        <div className="text-xs text-[var(--text-muted)]">{doc.supplier || doc.customer || 'Entidade desconhecida'}</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-xs font-bold ${getStatusColor(doc.status)} uppercase tracking-wider`}>
                                            {doc.status}
                                        </span>
                                        <div className="text-sm font-mono opacity-80">{fmtEUR(doc.total)}</div>
                                        <button className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity">🔗</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </GlassCard>

                {/* System Health / Status */}
                <GlassCard className="col-span-1 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">System Health</h3>
                        {healthLoading && <span className="animate-spin">⟳</span>}
                    </div>

                    {healthError && (
                        <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            {healthError}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-2">
                        {health.modules.length === 0 && !healthLoading && (
                            <div className="opacity-50 text-sm">Sem módulos reportados.</div>
                        )}
                        {health.modules.map(m => (
                            <div key={m.name} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border)]">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{getHealthIcon(m)}</span>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold uppercase tracking-widest">{m.name}</span>
                                        <span className="text-[10px] opacity-50 font-mono">{m.pid ? `PID: ${m.pid}` : 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${!m.closed ? 'border-amber-500/30 text-amber-500 bg-amber-500/10' : 'border-green-500/30 text-green-500 bg-green-500/10'}`}>
                                        {!m.closed ? 'DEV' : 'STABLE'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                        <div className="text-[10px] text-[var(--text-muted)] text-center">
                            Gravity Engine v2.4.0 • Running on Local
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* 4. Collapsible Charts */}
            {showCharts && (
                <div className="shrink-0 max-h-[400px] overflow-auto border-t border-[var(--border)] pt-4">
                    <ChartsAll ref={chartsRef} project={project} />
                </div>
            )}

        </div>
    );
}
