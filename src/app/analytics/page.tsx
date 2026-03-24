'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://pranavbharadwaj.pythonanywhere.com';

// ─── Types ───────────────────────────────────────────────────────────
interface Summary {
  total_trades: number; open_positions: number; wins: number; losses: number;
  win_rate: number; total_pnl: number; today_pnl: number; today_trades: number;
  avg_win: number; avg_loss: number; avg_pnl_pct: number; profit_factor: number;
  expectancy: number; gross_profit: number; gross_loss: number;
  max_win_streak: number; max_loss_streak: number; avg_hold_minutes: number;
  capital_deployed: number;
  best_trade: { id: string; symbol: string; pnl: number; pnl_pct: number; exit_reason: string } | null;
  worst_trade: { id: string; symbol: string; pnl: number; pnl_pct: number; exit_reason: string } | null;
}

interface DailyPnL { date: string; pnl: number; cumulative_pnl: number; trades: number; wins: number; losses: number; win_rate: number; }
interface MonthlyPnL { month: string; pnl: number; trades: number; wins: number; losses: number; win_rate: number; }
interface Performance {
  sharpe_ratio: number; sortino_ratio: number; max_drawdown: number;
  max_drawdown_pct: number; cagr: number; calmar_ratio: number;
  recovery_factor: number; avg_daily_pnl: number; volatility: number;
  total_days: number; profitable_days: number; losing_days: number;
}
interface DrawdownPoint { date: string; equity: number; peak: number; drawdown: number; drawdown_pct: number; }
interface WinRatePoint { trade_num: number; date: string; win_rate: number; avg_pnl: number; window: number; }
interface SectorData { sector: string; total_trades: number; wins: number; losses: number; pnl: number; win_rate: number; capital: number; }
interface SymbolData { symbol: string; sector: string; trades: number; wins: number; losses: number; pnl: number; win_rate: number; avg_pnl: number; avg_confidence: number; }
interface SignalData { signal: string; trades: number; wins: number; pnl: number; win_rate: number; avg_confidence: number; }
interface ConfBucket { range: string; trades: number; wins: number; pnl: number; win_rate: number; }
interface ExitData { reason: string; trades: number; wins: number; losses: number; pnl: number; win_rate: number; avg_pnl: number; }
interface JournalEntry {
  id: string; symbol: string; sector: string; signal: string; confidence: number;
  entry_price: number; exit_price: number; target_price: number; stop_loss: number;
  highest_price: number; quantity: number; pnl: number; pnl_pct: number;
  exit_reason: string; entry_time: string; exit_time: string;
  hold_minutes: number; mae: number; mfe: number;
  target_achievement: number; r_multiple: number;
  is_paper: boolean; note: string | null; rating: number | null; tags: string | null;
}
interface EquityPoint { date: string; equity: number; trade_num: number; }
interface RiskMetrics {
  var_95: number; var_99: number; open_positions: number;
  total_capital_deployed: number; avg_position_size: number;
  max_concentration: number; concentration: Record<string, number>;
}
interface StrategyData { strategy: string; trades: number; wins: number; pnl: number; win_rate: number; avg_confidence: number; avg_pnl: number; }

interface FullAnalytics {
  summary: Summary;
  daily_pnl: DailyPnL[];
  monthly_pnl: MonthlyPnL[];
  performance: Performance;
  drawdown: { drawdown_series: DrawdownPoint[]; max_drawdown: number; current_drawdown: number; };
  win_rate_trend: WinRatePoint[];
  sectors: { sectors: SectorData[]; total_sectors: number; };
  symbols: SymbolData[];
  signal_accuracy: { by_signal: SignalData[]; by_confidence: ConfBucket[]; };
  exit_analysis: ExitData[];
  risk: RiskMetrics;
  strategies: StrategyData[];
  equity_curve: EquityPoint[];
  hourly_heatmap: { hour: number; day: string; pnl: number; trades: number; avg_pnl: number }[];
}

const COLORS = ['#00C9A7', '#845EF7', '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA'];

const fmt = (v: number) => v >= 0 ? `+₹${v.toLocaleString('en-IN')}` : `-₹${Math.abs(v).toLocaleString('en-IN')}`;
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtShort = (v: number) => {
  const abs = Math.abs(v);
  const s = abs >= 100000 ? `${(abs / 100000).toFixed(1)}L` : abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0);
  return v >= 0 ? `+₹${s}` : `-₹${s}`;
};

/* Shared card + panel classes */
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 sm:p-4';
const tooltipStyle = { backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: 11 };

type Tab = 'overview' | 'pnl' | 'trades' | 'risk' | 'journal' | 'ai';

export default function AnalyticsPage() {
  const [data, setData] = useState<FullAnalytics | null>(null);
  const [aiData, setAiData] = useState<Record<string, unknown> | null>(null);
  const [botStatus, setBotStatus] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [paperFilter, setPaperFilter] = useState<string>('all');
  const [journalPage, setJournalPage] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const params = paperFilter !== 'all' ? `?paper=${paperFilter}` : '';
      const [res, aiRes, botRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/full${params}`),
        fetch(`${API_BASE}/api/analytics/learning_insights`),
        fetch(`${API_BASE}/api/bot/status`),
      ]);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      if (aiRes.ok) setAiData(await aiRes.json());
      if (botRes.ok) setBotStatus(await botRes.json());
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [paperFilter]);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 30000); return () => clearInterval(id); }, [fetchData]);

  const tabs: { id: Tab; label: string; shortLabel: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: '📊' },
    { id: 'pnl', label: 'P&L Analysis', shortLabel: 'P&L', icon: '💰' },
    { id: 'trades', label: 'Trade Quality', shortLabel: 'Quality', icon: '🎯' },
    { id: 'risk', label: 'Risk Metrics', shortLabel: 'Risk', icon: '🛡️' },
    { id: 'journal', label: 'Trade Journal', shortLabel: 'Journal', icon: '📝' },
    { id: 'ai', label: 'AI Insights', shortLabel: 'AI', icon: '🧠' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading analytics...</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 text-xl mb-2">⚠️ {error || 'No data'}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-emerald-600 rounded-lg text-white">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pt-20 pb-12 px-2 sm:px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4 sm:mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                📊 Portfolio Analytics
              </h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-1 hidden sm:block">Comprehensive trade analysis & performance tracking</p>
            </div>
            <div className="flex gap-1.5">
              {['all', 'false', 'true'].map(f => (
                <button key={f} onClick={() => { setPaperFilter(f); setJournalPage(0); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    paperFilter === f ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}>
                  {f === 'all' ? '🔄 All' : f === 'false' ? '💰 Live' : '📄 Paper'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bot Status Bar */}
        {botStatus && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs">
            <span className={botStatus.enabled ? 'text-emerald-400' : 'text-red-400'}>
              {botStatus.enabled ? '🟢 Bot Running' : '🔴 Bot Stopped'}
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Mode: <span className={botStatus.mode === 'paper' ? 'text-yellow-400' : 'text-red-400'}>{botStatus.mode === 'paper' ? '📄 Paper' : '💰 Live'}</span></span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Today: <span className={(botStatus.today?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {(botStatus.today?.pnl || 0) >= 0 ? '+' : ''}₹{Math.abs(botStatus.today?.pnl || 0).toLocaleString('en-IN')}
            </span> ({botStatus.today?.wins || 0}W/{botStatus.today?.losses || 0}L)</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Total: <span className="text-white">{botStatus.stats?.total_trades || 0} trades</span> ({botStatus.stats?.win_rate || 0}% WR)</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Scan: <span className="text-gray-300">{botStatus.last_scan || '—'}</span></span>
          </div>
        )}

        {/* Tab Navigation — scrollable on mobile, larger touch targets */}
        <div className="flex gap-1 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                tab === t.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}>
              {t.icon} <span className="sm:hidden">{t.shortLabel}</span><span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Data mode indicator */}
        {data.summary.total_trades === 0 && (
          <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 sm:p-4 text-center">
            <p className="text-yellow-400 text-sm font-medium mb-2">
              📭 No {paperFilter === 'false' ? 'live' : paperFilter === 'true' ? 'paper' : ''} trades in analytics DB.
              {botStatus && (botStatus.stats?.total_trades || 0) > 0 && (
                <span className="text-gray-400 ml-1">({botStatus.stats.total_trades} trades in bot DB — needs sync)</span>
              )}
            </p>
            <div className="flex gap-2 justify-center">
              {paperFilter !== 'all' && (
                <button onClick={() => setPaperFilter('all')} className="px-3 py-1.5 bg-yellow-600/20 text-yellow-400 rounded-lg text-xs hover:bg-yellow-600/30">
                  Show all trades
                </button>
              )}
              <button onClick={async () => {
                try {
                  await fetch(`${API_BASE}/api/analytics/sync`, { method: 'POST' });
                  fetchData();
                } catch (e) { console.error(e); }
              }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-500">
                🔄 Sync Trades to Analytics
              </button>
            </div>
          </div>
        )}
        {paperFilter !== 'all' && data.summary.total_trades > 0 && (
          <div className={`mb-4 rounded-xl px-3 py-2 text-xs font-medium inline-flex items-center gap-2 ${
            paperFilter === 'false' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
          }`}>
            {paperFilter === 'false' ? '🔴 Showing LIVE trades only' : '📄 Showing PAPER trades only'} — {data.summary.total_trades} trades
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === 'overview' && <OverviewTab data={data} />}
            {tab === 'pnl' && <PnLTab data={data} />}
            {tab === 'trades' && <TradeQualityTab data={data} />}
            {tab === 'risk' && <RiskTab data={data} />}
            {tab === 'journal' && <JournalTab data={data} page={journalPage} setPage={setJournalPage} paperFilter={paperFilter} />}
            {tab === 'ai' && <AIInsightsTab data={aiData} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════
function OverviewTab({ data }: { data: FullAnalytics }) {
  const s = data.summary;
  const perf = data.performance;

  const cards = [
    { label: 'Total P&L', value: fmtShort(s.total_pnl), color: s.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400', sub: `${s.total_trades} trades` },
    { label: 'Today P&L', value: fmtShort(s.today_pnl), color: s.today_pnl >= 0 ? 'text-emerald-400' : 'text-red-400', sub: `${s.today_trades} today` },
    { label: 'Win Rate', value: `${s.win_rate}%`, color: s.win_rate >= 60 ? 'text-emerald-400' : s.win_rate >= 45 ? 'text-yellow-400' : 'text-red-400', sub: `${s.wins}W / ${s.losses}L` },
    { label: 'Profit Factor', value: `${s.profit_factor}x`, color: s.profit_factor >= 1.5 ? 'text-emerald-400' : s.profit_factor >= 1 ? 'text-yellow-400' : 'text-red-400', sub: `Exp: ₹${s.expectancy}` },
    { label: 'Sharpe', value: (perf.sharpe_ratio || 0).toFixed(2), color: (perf.sharpe_ratio || 0) >= 1 ? 'text-emerald-400' : (perf.sharpe_ratio || 0) >= 0 ? 'text-yellow-400' : 'text-red-400', sub: `Sortino: ${(perf.sortino_ratio || 0).toFixed(2)}` },
    { label: 'Max DD', value: fmtShort(-(perf.max_drawdown || 0)), color: 'text-red-400', sub: `${perf.max_drawdown_pct || 0}% peak` },
    { label: 'Hold Time', value: `${s.avg_hold_minutes.toFixed(0)}m`, color: 'text-cyan-400', sub: `${s.max_win_streak}W streak` },
    { label: 'Open Pos', value: `${s.open_positions}`, color: 'text-purple-400', sub: fmtShort(s.capital_deployed) },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Cards — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {cards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={card}>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 truncate">{c.label}</p>
            <p className={`text-base sm:text-xl font-bold ${c.color} truncate`}>{c.value}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Equity Curve — shorter on mobile */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📈 Equity Curve</h3>
        {data.equity_curve.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.equity_curve}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00C9A7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00C9A7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="equity" stroke="#00C9A7" fill="url(#eqGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        ) : <p className="text-gray-500 text-xs text-center py-8">No equity data yet</p>}
      </div>

      {/* Best/Worst + Sector — stack on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Best & Worst Trades */}
        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🏆 Best & Worst</h3>
          {s.best_trade && (
            <div className="flex items-center justify-between py-1.5 border-b border-white/5 gap-2">
              <div className="min-w-0 truncate"><span className="text-emerald-400 font-mono text-xs sm:text-sm">🟢 {s.best_trade.symbol}</span></div>
              <span className="text-emerald-400 font-bold text-xs sm:text-sm shrink-0">{fmtShort(s.best_trade.pnl)}</span>
            </div>
          )}
          {s.worst_trade && (
            <div className="flex items-center justify-between py-1.5 gap-2">
              <div className="min-w-0 truncate"><span className="text-red-400 font-mono text-xs sm:text-sm">🔴 {s.worst_trade.symbol}</span></div>
              <span className="text-red-400 font-bold text-xs sm:text-sm shrink-0">{fmtShort(s.worst_trade.pnl)}</span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-[10px] text-gray-500">Avg Win</p>
              <p className="text-emerald-400 font-bold text-xs sm:text-sm">{fmtShort(s.avg_win)}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-[10px] text-gray-500">Avg Loss</p>
              <p className="text-red-400 font-bold text-xs sm:text-sm">{fmtShort(s.avg_loss)}</p>
            </div>
          </div>
        </div>

        {/* Sector Pie — smaller on mobile */}
        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🏭 Sectors</h3>
          {data.sectors.sectors.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.sectors.sectors.slice(0, 6)} cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                dataKey="total_trades" nameKey="sector"
                label={({ name, percent }: { name?: string; percent?: number }) => {
                  const p = ((percent || 0) * 100);
                  return p > 8 ? `${(name || '').slice(0, 6)} ${p.toFixed(0)}%` : '';
                }}
                labelLine={false} >
                {data.sectors.sectors.slice(0, 6).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          ) : <p className="text-gray-500 text-xs text-center py-8">No sector data yet</p>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// P&L ANALYSIS TAB
// ═══════════════════════════════════════════════════════════════════
function PnLTab({ data }: { data: FullAnalytics }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Daily P&L + Cumulative */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📅 Daily P&L</h3>
        {data.daily_pnl.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data.daily_pnl}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval="preserveStartEnd" />
            <YAxis yAxisId="pnl" tick={{ fontSize: 9, fill: '#6b7280' }} width={40} />
            <YAxis yAxisId="cum" orientation="right" tick={{ fontSize: 9, fill: '#6b7280' }} width={40} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar yAxisId="pnl" dataKey="pnl" name="Daily P&L" fill="#00C9A7" radius={[2, 2, 0, 0]} />
            <Line yAxisId="cum" type="monotone" dataKey="cumulative_pnl" name="Cumulative" stroke="#845EF7" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        ) : <p className="text-gray-500 text-xs text-center py-8">No daily P&L data yet</p>}
      </div>

      {/* Monthly P&L */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📊 Monthly P&L</h3>
        {data.monthly_pnl.length > 0 ? (
        <>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.monthly_pnl}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={40} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
              {data.monthly_pnl.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? '#00C9A7' : '#FF6B6B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Monthly table */}
        <div className="mt-3 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-[10px] sm:text-xs min-w-[280px]">
            <thead><tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1 px-1.5 sm:px-2">Month</th><th className="text-right px-1.5">Trades</th>
              <th className="text-right px-1.5">W/L</th><th className="text-right px-1.5">Win%</th><th className="text-right px-1.5">P&L</th>
            </tr></thead>
            <tbody>
              {data.monthly_pnl.map((m, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-1 px-1.5 font-mono">{m.month}</td>
                  <td className="text-right px-1.5">{m.trades}</td>
                  <td className="text-right px-1.5">{m.wins}/{m.losses}</td>
                  <td className="text-right px-1.5">{m.win_rate}%</td>
                  <td className={`text-right px-1.5 font-bold ${m.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(m.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        ) : <p className="text-gray-500 text-xs text-center py-8">No monthly P&L data yet</p>}
      </div>
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📉 Drawdown <span className="text-red-400 ml-1">Max: ₹{data.drawdown.max_drawdown}</span></h3>
        {data.drawdown.drawdown_series.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data.drawdown.drawdown_series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={40} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="drawdown" stroke="#FF6B6B" fill="#FF6B6B" fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        ) : <p className="text-gray-500 text-xs text-center py-8">No drawdown data yet</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRADE QUALITY TAB
// ═══════════════════════════════════════════════════════════════════
function TradeQualityTab({ data }: { data: FullAnalytics }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Win Rate Trend */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📈 Rolling Win Rate (20-trade)</h3>
        {data.win_rate_trend.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.win_rate_trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
            <XAxis dataKey="trade_num" tick={{ fontSize: 9, fill: '#6b7280' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={30} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="win_rate" stroke="#00C9A7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={() => 50} stroke="#FF6B6B" strokeDasharray="5 5" strokeWidth={1} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        ) : <p className="text-gray-500 text-xs text-center py-8">Not enough trades for win rate trend</p>}
      </div>

      {/* Signal Accuracy + Confidence — stack on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🎯 Signal Accuracy</h3>
          {data.signal_accuracy.by_signal.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 gap-2">
              <div className="min-w-0">
                <span className={`text-xs sm:text-sm font-bold ${s.signal.includes('STRONG') ? 'text-emerald-400' : s.signal.includes('BUY') ? 'text-green-400' : 'text-gray-400'}`}>{s.signal}</span>
                <span className="text-[10px] text-gray-500 ml-1">{s.trades}t</span>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-xs sm:text-sm font-bold ${s.win_rate >= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>{s.win_rate}%</span>
                <span className={`text-[10px] ml-1 ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(s.pnl)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📊 Confidence vs Win%</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.signal_accuracy.by_confidence}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f3a" />
              <XAxis dataKey="range" tick={{ fontSize: 8, fill: '#6b7280' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={30} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="win_rate" name="Win %" fill="#845EF7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Exit Reason — 2 cols on mobile */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🚪 Exit Reasons</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.exit_analysis.map((e, i) => (
            <div key={i} className="bg-white/5 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">{e.reason.replace(/_/g, ' ')}</p>
              <p className="text-sm sm:text-lg font-bold text-white">{e.trades}</p>
              <p className={`text-[10px] sm:text-sm ${e.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(e.pnl)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Symbol Performance — horizontally scrollable on mobile */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">📋 Symbol Performance</h3>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-[10px] sm:text-xs min-w-[400px]">
            <thead><tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5 px-1.5">Symbol</th>
              <th className="text-left px-1.5 hidden sm:table-cell">Sector</th>
              <th className="text-right px-1.5">#</th><th className="text-right px-1.5">Win%</th>
              <th className="text-right px-1.5">P&L</th><th className="text-right px-1.5">Avg</th>
              <th className="text-right px-1.5 hidden sm:table-cell">Conf</th>
            </tr></thead>
            <tbody>
              {data.symbols.slice(0, 15).map((sym, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-1.5 font-mono font-bold">{sym.symbol}</td>
                  <td className="px-1.5 text-gray-400 hidden sm:table-cell">{sym.sector}</td>
                  <td className="text-right px-1.5">{sym.trades}</td>
                  <td className={`text-right px-1.5 ${sym.win_rate >= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>{sym.win_rate}%</td>
                  <td className={`text-right px-1.5 font-bold ${sym.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(sym.pnl)}</td>
                  <td className={`text-right px-1.5 ${sym.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(sym.avg_pnl)}</td>
                  <td className="text-right px-1.5 text-gray-400 hidden sm:table-cell">{sym.avg_confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategy Comparison */}
      {data.strategies.length > 0 && (
        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">⚙️ Strategies</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {data.strategies.map((st, i) => (
              <div key={i} className="bg-white/5 rounded-lg p-2.5">
                <p className="font-bold text-xs sm:text-sm text-cyan-400 truncate">{st.strategy}</p>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5 text-[10px] sm:text-xs">
                  <div><span className="text-gray-500">Trades:</span> <span className="text-white">{st.trades}</span></div>
                  <div><span className="text-gray-500">Win%:</span> <span className={st.win_rate >= 60 ? 'text-emerald-400' : 'text-yellow-400'}>{st.win_rate}%</span></div>
                  <div><span className="text-gray-500">P&L:</span> <span className={st.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtShort(st.pnl)}</span></div>
                  <div><span className="text-gray-500">Avg:</span> <span>{fmtShort(st.avg_pnl)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RISK METRICS TAB
// ═══════════════════════════════════════════════════════════════════
function RiskTab({ data }: { data: FullAnalytics }) {
  const r = data.risk;
  const perf = data.performance;

  const riskCards = [
    { label: 'VaR (95%)', value: fmtShort(r.var_95), desc: 'Daily loss limit (95%)', color: 'text-yellow-400' },
    { label: 'VaR (99%)', value: fmtShort(r.var_99), desc: 'Worst-case daily', color: 'text-red-400' },
    { label: 'Max Conc.', value: `${r.max_concentration}%`, desc: 'Single stock exposure', color: r.max_concentration > 50 ? 'text-red-400' : 'text-yellow-400' },
    { label: 'Avg Pos Size', value: fmtShort(r.avg_position_size), desc: 'Capital per trade', color: 'text-cyan-400' },
    { label: 'Sharpe', value: (perf.sharpe_ratio || 0).toFixed(2), desc: '>1 good, >2 great', color: (perf.sharpe_ratio || 0) >= 1 ? 'text-emerald-400' : 'text-yellow-400' },
    { label: 'Sortino', value: (perf.sortino_ratio || 0).toFixed(2), desc: 'Downside-adjusted', color: (perf.sortino_ratio || 0) >= 1 ? 'text-emerald-400' : 'text-yellow-400' },
    { label: 'Recovery', value: (perf.recovery_factor || 0).toFixed(2), desc: 'P&L / Max DD', color: (perf.recovery_factor || 0) >= 1 ? 'text-emerald-400' : 'text-yellow-400' },
    { label: 'Profitable', value: `${perf.profitable_days || 0}/${perf.total_days || 0}`, desc: `${(perf.total_days || 0) > 0 ? ((perf.profitable_days || 0) / (perf.total_days || 1) * 100).toFixed(0) : 0}% days`, color: 'text-cyan-400' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Risk KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {riskCards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={card}>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 truncate">{c.label}</p>
            <p className={`text-base sm:text-xl font-bold ${c.color} truncate`}>{c.value}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">{c.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Concentration Breakdown */}
      {Object.keys(r.concentration).length > 0 && (
        <div className={card}>
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🔍 Position Concentration</h3>
          <div className="space-y-2">
            {Object.entries(r.concentration).sort(([,a], [,b]) => b - a).map(([sym, pct], i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] sm:text-sm font-mono w-16 sm:w-20 truncate">{sym}</span>
                <div className="flex-1 bg-white/5 rounded-full h-3 sm:h-4 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct > 50 ? 'bg-red-500' : pct > 30 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="text-[10px] sm:text-xs text-gray-400 w-10 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector Table */}
      <div className={card}>
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-2">🏭 Sector Performance</h3>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-[10px] sm:text-xs min-w-[260px]">
            <thead><tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5 px-1.5">Sector</th><th className="text-right px-1.5">#</th>
              <th className="text-right px-1.5">Win%</th><th className="text-right px-1.5">P&L</th>
            </tr></thead>
            <tbody>
              {data.sectors.sectors.map((sec, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-1.5 font-bold">{sec.sector}</td>
                  <td className="text-right px-1.5">{sec.total_trades}</td>
                  <td className={`text-right px-1.5 ${sec.win_rate >= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>{sec.win_rate}%</td>
                  <td className={`text-right px-1.5 font-bold ${sec.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(sec.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRADE JOURNAL TAB
// ═══════════════════════════════════════════════════════════════════
function JournalTab({ data, page, setPage, paperFilter }: { data: FullAnalytics; page: number; setPage: (p: number) => void; paperFilter: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingJ, setLoadingJ] = useState(true);

  useEffect(() => {
    const params = paperFilter !== 'all' ? `?paper=${paperFilter}&limit=200` : '?limit=200';
    fetch(`${API_BASE}/api/analytics/journal${params}`)
      .then(r => r.json())
      .then(d => { setEntries(d.journal || []); setLoadingJ(false); })
      .catch(() => setLoadingJ(false));
  }, [paperFilter]);

  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loadingJ) return <div className="text-center py-12 text-gray-400">Loading trade journal...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-gray-300">📝 Journal — {entries.length} trades</h3>
        <div className="flex gap-1.5 items-center">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="px-2 py-1 bg-white/5 rounded text-[10px] sm:text-xs disabled:opacity-30">←</button>
          <span className="text-[10px] sm:text-xs text-gray-400">{page + 1}/{totalPages || 1}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="px-2 py-1 bg-white/5 rounded text-[10px] sm:text-xs disabled:opacity-30">→</button>
        </div>
      </div>

      <div className="space-y-2">
        {pageEntries.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
            className={card}>
            {/* Row 1: Symbol + P&L */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className={`text-sm sm:text-lg font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.pnl >= 0 ? '🟢' : '🔴'} {t.symbol}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{t.sector}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.signal?.includes('STRONG') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{t.signal}</span>
                {t.is_paper && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">PAPER</span>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm sm:text-xl font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtShort(t.pnl)}</p>
                <p className={`text-[10px] sm:text-xs ${t.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(t.pnl_pct)}</p>
              </div>
            </div>

            {/* Row 2: Price details — 2 cols mobile, 6 cols desktop */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 text-[10px] sm:text-xs">
              <div><span className="text-gray-500">Entry:</span> <span className="text-white">₹{t.entry_price.toFixed(1)}</span></div>
              <div><span className="text-gray-500">Exit:</span> <span className="text-white">₹{t.exit_price.toFixed(1)}</span></div>
              <div><span className="text-gray-500">Target:</span> <span className="text-white">₹{t.target_price.toFixed(1)}</span></div>
              <div><span className="text-gray-500">SL:</span> <span className="text-white">₹{t.stop_loss.toFixed(1)}</span></div>
              <div><span className="text-gray-500">High:</span> <span className="text-cyan-400">₹{t.highest_price.toFixed(1)}</span></div>
              <div><span className="text-gray-500">Hold:</span> <span className="text-white">{t.hold_minutes.toFixed(0)}m</span></div>
            </div>

            {/* Row 3: Advanced Metrics */}
            <div className="mt-1.5 pt-1.5 border-t border-white/5 grid grid-cols-4 sm:grid-cols-8 gap-1 text-[10px] sm:text-xs text-center">
              <div><span className="text-gray-500 block">R</span><span className={t.r_multiple >= 0 ? 'text-emerald-400' : 'text-red-400'}>{t.r_multiple.toFixed(1)}</span></div>
              <div><span className="text-gray-500 block">Tgt%</span><span>{t.target_achievement.toFixed(0)}%</span></div>
              <div><span className="text-gray-500 block">MFE</span><span className="text-emerald-400">₹{t.mfe.toFixed(1)}</span></div>
              <div><span className="text-gray-500 block">MAE</span><span className="text-red-400">₹{t.mae.toFixed(1)}</span></div>
              <div className="hidden sm:block"><span className="text-gray-500 block">Conf</span><span>{t.confidence?.toFixed(0)}%</span></div>
              <div className="hidden sm:block"><span className="text-gray-500 block">Qty</span><span>{t.quantity}</span></div>
              <div className="hidden sm:block"><span className="text-gray-500 block">Exit</span><span className="text-gray-400">{t.exit_reason?.replace(/_/g, ' ')}</span></div>
              <div className="hidden sm:block"><span className="text-gray-500 block">Time</span><span>{t.entry_time?.slice(11, 16)}</span></div>
            </div>
          </motion.div>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-sm mb-3">No closed trades yet. Start trading to build your journal!</p>
          {data.summary.total_trades > 0 && (
            <p className="text-xs text-yellow-400 mb-2">Analytics has {data.summary.total_trades} trades — journal may need syncing.</p>
          )}
          <button onClick={async () => {
            try {
              await fetch(`${API_BASE}/api/analytics/sync`, { method: 'POST' });
              window.location.reload();
            } catch (e) { console.error(e); }
          }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-500">
            🔄 Sync Trades
          </button>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  AI INSIGHTS TAB — Learning, ML Model, Adaptive Brain
// ═══════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
function AIInsightsTab({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return (
    <div className="text-center py-12 text-gray-500">
      <p className="text-4xl mb-3">🧠</p>
      <p className="text-sm">Loading AI insights...</p>
    </div>
  );

  const today = data.today_summary as any || {};
  const learner = data.trade_learner as any || {};
  const brain = data.adaptive_brain as any || {};
  const ml = data.ml_model as any || {};
  const tracker = data.symbol_tracker as any || {};
  const cb = data.circuit_breaker as any || {};

  const todayWR = today.total_trades ? today.win_rate : 0;
  const lessons = learner.recent_lessons || [];
  const grades = learner.grades || [];
  const mistakes = learner.mistake_breakdown || [];
  const scoreBuckets = learner.score_performance || [];
  const regimeStats = learner.regime_stats || {};
  const phaseStats = learner.phase_stats || {};
  const topMistakes = learner.top_mistakes || [];
  const symPerf = brain.symbol_performance || {};
  const captureRatios = brain.capture_ratios || {};
  const exitReasons = today.exit_reasons || {};
  const todaySymbols = today.symbol_performance || {};

  const statCard = (icon: string, label: string, value: string | number, sub?: string, color?: string) => (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-gray-400 text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Today's Training Summary ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">📅 Today&apos;s Training Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {statCard('📊', 'Trades', today.total_trades || 0, `${today.wins || 0}W / ${today.losses || 0}L`)}
          {statCard('🎯', 'Win Rate', `${todayWR}%`, undefined, todayWR >= 60 ? 'text-emerald-400' : todayWR >= 45 ? 'text-yellow-400' : 'text-red-400')}
          {statCard('💰', 'P&L', `₹${(today.total_pnl || 0).toLocaleString('en-IN')}`, undefined, (today.total_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}
          {statCard('⏱️', 'Avg Hold', `${today.avg_hold_mins || 0}m`)}
          {statCard('🔄', 'SL Adjustments', today.total_sl_adjustments || 0, 'Trailing SL changes')}
          {statCard('📉', 'Gave Back Profit', today.trades_gave_back_profit || 0, `Avg peak: ${today.avg_max_unrealised || 0}%`)}
        </div>
      </div>

      {/* ── Exit Reasons + Symbol Performance (Today) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={card}>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">🚪 Today&apos;s Exit Reasons</h4>
          {Object.keys(exitReasons).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(exitReasons).sort((a: any, b: any) => (b[1] as any).count - (a[1] as any).count).map(([reason, d]: any) => (
                <div key={reason} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 truncate max-w-[60%]">{reason}</span>
                  <div className="flex gap-3">
                    <span className="text-white">{d.count}×</span>
                    <span className={d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>₹{Math.round(d.pnl).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-500 text-xs">No trades closed today</p>}
        </div>

        <div className={card}>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">📈 Today&apos;s Symbols</h4>
          {Object.keys(todaySymbols).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(todaySymbols).sort((a: any, b: any) => (b[1] as any).pnl - (a[1] as any).pnl).map(([sym, d]: any) => (
                <div key={sym} className="flex items-center justify-between text-xs">
                  <span className="text-white font-medium">{sym}</span>
                  <div className="flex gap-3">
                    <span className="text-gray-400">{d.wins}W/{d.trades - d.wins}L</span>
                    <span className={d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>₹{Math.round(d.pnl).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-500 text-xs">No trades today</p>}
        </div>
      </div>

      {/* ── Adaptive Brain Status ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">🧠 Adaptive Brain</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {statCard('🔢', 'Config Version', `v${brain.config_version || 0}`)}
          {statCard('📚', 'Trades Analyzed', (brain.trades_analyzed || 0).toLocaleString())}
          {statCard('📏', 'Min Edge', brain.min_edge || 0)}
          {statCard('🎯', 'Min Confidence', brain.min_confidence || 0)}
          {statCard('💎', 'Min Premium', `₹${brain.min_premium || 0}`)}
          {statCard('📦', 'Max Daily Trades', brain.max_daily_trades || 0)}
        </div>

        {/* Capture Ratios */}
        {Object.keys(captureRatios).length > 0 && (
          <div className={`${card} mt-2`}>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Trailing SL Capture Ratios (Learned)</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(captureRatios).map(([tier, ratio]: any) => (
                <div key={tier} className="bg-white/5 rounded-lg px-3 py-1.5 text-center">
                  <div className="text-[10px] text-gray-500 uppercase">{tier}</div>
                  <div className="text-sm font-bold text-cyan-400">{(ratio * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked Hours */}
        {(brain.blocked_hours_ist || []).length > 0 && (
          <div className={`${card} mt-2`}>
            <h4 className="text-xs font-semibold text-gray-400 mb-1">🚫 Blocked Hours (Learned)</h4>
            <p className="text-xs text-red-400">{(brain.blocked_hours_ist || []).map((h: number) => `${h}:00`).join(', ')} IST</p>
          </div>
        )}

        {/* Symbol Health */}
        {Object.keys(symPerf).length > 0 && (
          <div className={`${card} mt-2`}>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Symbol Health (Learned)</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(symPerf).map(([sym, d]: any) => {
                const colors: Record<string, string> = {
                  STRONG: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                  NORMAL: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
                  WEAK: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                  TOXIC: 'bg-red-500/20 text-red-400 border-red-500/30',
                };
                return (
                  <span key={sym} className={`px-2 py-0.5 rounded-full text-[10px] border ${colors[d.health] || colors.NORMAL}`}>
                    {sym} ({d.health})
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Learning System (Lessons, Grades, Mistakes) ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">📖 Learning System</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Grade Distribution */}
          <div className={card}>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Grade Distribution</h4>
            {grades.length > 0 ? (
              <div className="space-y-1.5">
                {grades.map((g: any) => {
                  const gradeColors: Record<string, string> = { A: 'text-emerald-400', B: 'text-cyan-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
                  return (
                    <div key={g.grade} className="flex items-center justify-between text-xs">
                      <span className={`font-bold ${gradeColors[g.grade] || 'text-white'}`}>{g.grade}</span>
                      <div className="flex-1 mx-2 bg-white/5 rounded-full h-2">
                        <div className={`h-2 rounded-full ${g.grade === 'A' || g.grade === 'B' ? 'bg-emerald-500' : g.grade === 'C' ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, g.cnt * 5)}%` }} />
                      </div>
                      <span className="text-gray-400 w-8 text-right">{g.cnt}</span>
                      <span className={`w-16 text-right ${(g.avg_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ₹{Math.round(g.avg_pnl || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-gray-500 text-xs">No grades yet</p>}
          </div>

          {/* Top Mistakes */}
          <div className={card}>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">🔴 Top Mistakes</h4>
            {topMistakes.length > 0 ? (
              <div className="space-y-1.5">
                {topMistakes.slice(0, 6).map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate max-w-[50%]">{(m.mistake_type || '').replace(/_/g, ' ')}</span>
                    <div className="flex gap-2">
                      <span className="text-white">{m.count}×</span>
                      <span className="text-red-400">₹{Math.abs(Math.round(m.total_loss || 0)).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-gray-500 text-xs">No mistakes detected</p>}
          </div>

          {/* Score Performance Buckets */}
          <div className={card}>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">🎯 Score → Win Rate</h4>
            {scoreBuckets.length > 0 ? (
              <div className="space-y-1.5">
                {scoreBuckets.map((b: any, i: number) => {
                  const wr = b.trades ? (b.wins / b.trades * 100) : 0;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 truncate max-w-[40%]">{b.bucket}</span>
                      <div className="flex gap-2">
                        <span className="text-white">{b.trades}t</span>
                        <span className={wr >= 55 ? 'text-emerald-400' : 'text-red-400'}>{wr.toFixed(0)}%</span>
                        <span className={(b.avg_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          ₹{Math.round(b.avg_pnl || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-gray-500 text-xs">Need more trades</p>}
          </div>
        </div>
      </div>

      {/* ── Regime & Phase Performance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">🌊 Market Regime Performance</h4>
          {Object.keys(regimeStats).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(regimeStats).map(([regime, d]: any) => {
                const wr = d.trades ? (d.wins / d.trades * 100) : 0;
                return (
                  <div key={regime} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{regime.replace(/_/g, ' ')}</span>
                    <div className="flex gap-3">
                      <span className="text-gray-400">{d.trades}t</span>
                      <span className={wr >= 55 ? 'text-emerald-400' : 'text-yellow-400'}>{wr.toFixed(0)}% WR</span>
                      <span className={(d.avg_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>₹{Math.round(d.avg_pnl || 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-500 text-xs">No regime data</p>}
        </div>

        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">⏰ Intraday Phase Performance</h4>
          {Object.keys(phaseStats).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(phaseStats).map(([phase, d]: any) => {
                const wr = d.trades ? (d.wins / d.trades * 100) : 0;
                return (
                  <div key={phase} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate max-w-[40%]">{phase}</span>
                    <div className="flex gap-3">
                      <span className="text-gray-400">{d.trades}t</span>
                      <span className={wr >= 55 ? 'text-emerald-400' : 'text-yellow-400'}>{wr.toFixed(0)}% WR</span>
                      <span className={(d.avg_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>₹{Math.round(d.avg_pnl || 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-500 text-xs">No phase data</p>}
        </div>
      </div>

      {/* ── ML Model + System Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">🤖 ML Model</h4>
          {ml && !ml.error ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-400">Signals tracked</span><span className="text-white">{ml.signals_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Features</span><span className="text-white">{ml.feature_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Model type</span><span className="text-cyan-400 text-[10px]">{ml.model_type || 'N/A'}</span></div>
              {ml.accuracy && <div className="flex justify-between"><span className="text-gray-400">Accuracy</span><span className="text-emerald-400">{(ml.accuracy * 100).toFixed(1)}%</span></div>}
            </div>
          ) : <p className="text-gray-500 text-xs">{ml?.error || 'ML model not loaded'}</p>}
        </div>

        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">🛡️ Circuit Breaker</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className={cb.halted ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                {cb.halted ? '🔴 HALTED' : '🟢 ACTIVE'}
              </span>
            </div>
            {cb.halted && <div className="flex justify-between"><span className="text-gray-400">Reason</span><span className="text-red-300 text-[10px]">{cb.reason}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Size multiplier</span><span className="text-white">{((cb.size_multiplier || 1) * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">📊 Symbol Tracker</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">Daily trades</span><span className="text-white">{tracker.daily_trades || 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Symbols tracked</span><span className="text-white">{Object.keys(tracker.symbols || {}).length}</span></div>
            {Object.entries(tracker.symbols || {}).filter(([, d]: any) => d.blocked).map(([sym]: any) => (
              <div key={sym} className="flex justify-between">
                <span className="text-red-400">🚫 {sym}</span>
                <span className="text-red-300 text-[10px]">Blocked (consecutive losses)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Lessons ── */}
      {lessons.length > 0 && (
        <div className={card}>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">📝 Recent Lessons (Last 10 Trades)</h4>
          <div className="space-y-1.5">
            {lessons.map((l: any, i: number) => {
              const gradeColors: Record<string, string> = { A: 'text-emerald-400', B: 'text-cyan-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
              return (
                <div key={i} className="flex items-start gap-2 text-xs border-b border-white/5 pb-1.5">
                  <span className={`font-bold w-5 ${gradeColors[l.grade] || 'text-white'}`}>{l.grade}</span>
                  <span className={`w-4 ${l.won ? 'text-emerald-400' : 'text-red-400'}`}>{l.won ? '✓' : '✗'}</span>
                  <span className="text-white font-medium w-28 truncate">{l.symbol}</span>
                  <span className={`w-14 text-right ${l.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.pnl_pct >= 0 ? '+' : ''}{(l.pnl_pct || 0).toFixed(1)}%
                  </span>
                  <span className="text-gray-500 flex-1 truncate">{(l.lesson || '').slice(0, 80)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
