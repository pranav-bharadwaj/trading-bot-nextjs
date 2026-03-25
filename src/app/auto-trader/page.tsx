'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBotStatus, useBotPositions, useBotWeekly, useBotLog } from '@/hooks/useMarketData';
import { formatNumber, formatPercent, formatCurrency, getPnlColor, timeAgo } from '@/lib/utils';
import SkeletonCard, { SkeletonTable, SkeletonChart } from '@/components/SkeletonLoader';
import { API_BASE } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine
} from 'recharts';

/* ─── Helpers ─── */

function pnlBorder(v: number) {
  return v > 0 ? 'border-accent-green/30' : v < 0 ? 'border-accent-red/30' : 'border-white/5';
}

function exitReasonBadge(reason: string) {
  if (!reason) return 'bg-gray-700/30 text-gray-400';
  const r = reason.toUpperCase();
  if (r.includes('TARGET') || r.includes('PROFIT')) return 'bg-accent-green/10 text-accent-green';
  if (r.includes('STOP') || r.includes('HARD')) return 'bg-accent-red/10 text-accent-red';
  if (r.includes('EOD') || r.includes('EXPIRY')) return 'bg-accent-gold/10 text-accent-gold';
  return 'bg-gray-700/30 text-gray-400';
}

function eventBadge(event: string) {
  switch (event) {
    case 'OPEN': return 'bg-accent-blue/10 text-accent-blue';
    case 'CLOSE': return 'bg-accent-green/10 text-accent-green';
    case 'EXIT': return 'bg-accent-red/10 text-accent-red';
    case 'ERROR': return 'bg-accent-red/15 text-accent-red';
    case 'SCAN': return 'bg-gray-700/30 text-gray-400';
    default: return 'bg-gray-700/30 text-gray-400';
  }
}

function durationStr(openedAt: string, closedAt: string): string {
  try {
    const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    if (ms < 0) return '—';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  } catch { return '—'; }
}

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.35 },
});

/* ─── Confirm Dialog ─── */

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="glass-card p-6 max-w-sm w-full mx-4 border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">{title}</h3>
            <p className="text-sm text-gray-400 mb-5">{message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-dark-700 hover:bg-dark-600 border border-white/5 transition-all">Cancel</button>
              <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/20 transition-all">Confirm</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Header ─── */

function Header() {
  const { data, isLoading, mutate } = useBotStatus(10000);
  const { mutate: mutatePositions } = useBotPositions(10000);
  const { mutate: mutateLog } = useBotLog(10000);
  const { mutate: mutateWeekly } = useBotWeekly(30000);

  const [dialog, setDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  if (isLoading || !data) return null;

  const running = data.running as boolean;
  const lastScan = data.last_scan as string;

  const refreshAll = () => { mutate(); mutatePositions(); mutateLog(); mutateWeekly(); };

  const handleToggle = async () => {
    const action = running ? 'stop' : 'start';
    if (running) {
      setDialog({
        title: 'Stop Trading?',
        message: 'The bot will stop scanning and entering new trades. Open positions will remain.',
        action: async () => {
          try { await fetch(`${API_BASE}/api/bot/toggle?action=${action}`, { method: 'POST' }); refreshAll(); } catch (e) { console.error(e); }
          setDialog(null);
        },
      });
    } else {
      try { await fetch(`${API_BASE}/api/bot/toggle?action=${action}`, { method: 'POST' }); refreshAll(); } catch (e) { console.error(e); }
    }
  };

  const handleCloseAll = () => {
    setDialog({
      title: 'Close All Positions?',
      message: 'This will immediately close every open position at current prices.',
      action: async () => {
        try { await fetch(`${API_BASE}/api/bot/close_all`, { method: 'POST' }); refreshAll(); } catch (e) { console.error(e); }
        setDialog(null);
      },
    });
  };

  const handleReset = () => {
    setDialog({
      title: 'Reset Bot?',
      message: 'This will close all positions, clear trade history, and reset capital to ₹1,00,000. This cannot be undone.',
      action: async () => {
        try { await fetch(`${API_BASE}/api/bot/reset`, { method: 'POST' }); refreshAll(); } catch (e) { console.error(e); }
        setDialog(null);
      },
    });
  };

  return (
    <>
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        onConfirm={() => dialog?.action()}
        onCancel={() => setDialog(null)}
      />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold gradient-text">Auto Trader</h1>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-accent-gold/15 text-accent-gold border border-accent-gold/25">
            Paper
          </span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${running ? 'bg-accent-green/10 border border-accent-green/20' : 'bg-accent-red/10 border border-accent-red/20'}`}>
              <span className={running ? 'status-dot-live' : 'status-dot-offline'} />
              <span className={`text-sm font-medium ${running ? 'text-accent-green' : 'text-accent-red'}`}>
                {running ? 'Running' : 'Stopped'}
              </span>
            </div>
            {lastScan && (
              <span className="text-xs text-gray-500">Last scan: {lastScan}</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleToggle}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                running
                  ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/20'
                  : 'bg-gradient-to-r from-accent-green to-accent-blue text-dark-900 hover:shadow-lg hover:shadow-accent-green/20'
              }`}
            >
              {running ? '⏸ Stop Trading' : '▶ Start Trading'}
            </button>
            <button onClick={handleCloseAll}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-accent-red border border-accent-red/20 hover:bg-accent-red/10 transition-all"
            >
              ✕ Close All
            </button>
            <button onClick={handleReset}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 bg-dark-700 hover:bg-dark-600 border border-white/5 transition-all"
            >
              🔄 Reset
            </button>
            <button onClick={refreshAll}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-accent-gold border border-accent-gold/20 hover:bg-accent-gold/10 transition-all"
            >
              ⟳ Refresh
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Portfolio Summary (8 cards) ─── */

function PortfolioSummary() {
  const { data, isLoading, error } = useBotStatus(10000);

  if (isLoading) return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
    </div>
  );
  if (error && !data) return (
    <div className="glass-card p-5 border border-accent-gold/20">
      <div className="flex items-center gap-3">
        <span className="text-accent-gold text-xl">⚠️</span>
        <div>
          <p className="text-accent-gold font-medium">Market Closed — Offline Mode</p>
          <p className="text-gray-500 text-xs mt-1">Data loads on page refresh. Live polling resumes 8:45 AM IST.</p>
        </div>
      </div>
    </div>
  );
  if (!data) return <div className="glass-card p-5 text-gray-400">Loading bot data...</div>;

  const p = data.portfolio as Record<string, number>;
  const s = data.stats as Record<string, number>;
  const today = (data as Record<string, unknown>).today as Record<string, number> | undefined;
  const openCount = (data.open_positions as number) || (s.open_positions as number) || 0;

  const cap = {
    initial: p.initial || p.initial_capital || 100000,
    available: p.available || p.available_capital || 0,
    deployed: p.deployed || p.deployed_capital || 0,
    total_pnl: p.total_pnl || 0,
    roi_pct: p.roi_pct || (p.initial || p.initial_capital || 100000) > 0
      ? ((p.total_pnl || 0) / (p.initial || p.initial_capital || 100000)) * 100 : 0,
    unrealised_pnl: p.unrealised_pnl || 0,
  };

  const todayPnl = today?.pnl || 0;
  const winRate = s.win_rate || 0;
  const wins = s.wins || 0;
  const losses = s.losses || 0;
  const maxPositions = ((data as Record<string, unknown>).config as Record<string, number>)?.max_positions || 5;

  const cards: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; border?: string }[] = [
    {
      label: 'Initial Capital',
      value: `₹${formatNumber(cap.initial, 0)}`,
    },
    {
      label: 'Available Capital',
      value: `₹${formatNumber(cap.available, 0)}`,
      color: 'text-accent-blue',
    },
    {
      label: 'Deployed Capital',
      value: `₹${formatNumber(cap.deployed, 0)}`,
      color: 'text-accent-gold',
    },
    {
      label: 'Total P&L',
      value: `${cap.total_pnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(cap.total_pnl), 0)}`,
      sub: <span className={getPnlColor(cap.roi_pct)}>{formatPercent(cap.roi_pct)} ROI</span>,
      color: getPnlColor(cap.total_pnl),
      border: pnlBorder(cap.total_pnl),
    },
    {
      label: "Today's P&L",
      value: `${todayPnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(todayPnl), 0)}`,
      color: getPnlColor(todayPnl),
      border: pnlBorder(todayPnl),
    },
    {
      label: 'Win Rate',
      value: `${winRate.toFixed(0)}%`,
      sub: <span className="text-gray-500">{wins}W / {losses}L</span>,
    },
    {
      label: 'Open Positions',
      value: `${openCount} / ${maxPositions}`,
    },
    {
      label: 'Unrealised P&L',
      value: `${cap.unrealised_pnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(cap.unrealised_pnl), 0)}`,
      color: getPnlColor(cap.unrealised_pnl),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <motion.div key={c.label} {...cardAnim(i * 0.04)}
          className={`glass-card p-4 border ${c.border || 'border-white/5'}`}
        >
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{c.label}</div>
          <div className={`text-xl font-bold ${c.color || ''}`}>{c.value}</div>
          {c.sub && <div className="text-xs mt-0.5">{c.sub}</div>}
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Open Positions Table ─── */

function OpenPositions() {
  const { data, isLoading, mutate } = useBotPositions(10000);
  const { mutate: mutateStatus } = useBotStatus(10000);
  const { mutate: mutateLog } = useBotLog(10000);

  const [dialog, setDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  if (isLoading) return <SkeletonTable rows={4} cols={10} />;

  const positions = (data?.open as Array<Record<string, unknown>>) || [];

  const totalUnrealisedPnl = positions.reduce((sum, pos) => sum + ((pos.pnl as number) || 0), 0);

  const handleClose = (id: number, symbol: string) => {
    setDialog({
      title: `Close ${symbol.replace('.NS', '')}?`,
      message: 'This position will be closed at the current market price.',
      action: async () => {
        try { await fetch(`${API_BASE}/api/bot/close?trade_id=${id}`, { method: 'POST' }); mutate(); mutateStatus(); mutateLog(); } catch (e) { console.error(e); }
        setDialog(null);
      },
    });
  };

  return (
    <>
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        onConfirm={() => dialog?.action()}
        onCancel={() => setDialog(null)}
      />
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <span>📈</span> Open Positions
            <span className="text-xs text-gray-500 font-normal">({positions.length})</span>
          </h3>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg">No open positions</p>
            <p className="text-sm mt-1">Bot will enter trades when confidence ≥ 70%</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-gray-500">
                  <th className="text-left p-3 font-medium">Symbol</th>
                  <th className="text-left p-3 font-medium">Strategy</th>
                  <th className="text-right p-3 font-medium">Strike</th>
                  <th className="text-right p-3 font-medium">Entry Prem</th>
                  <th className="text-right p-3 font-medium">Current</th>
                  <th className="text-right p-3 font-medium">Target</th>
                  <th className="text-right p-3 font-medium">SL</th>
                  <th className="text-right p-3 font-medium">P&L</th>
                  <th className="text-right p-3 font-medium">P&L%</th>
                  <th className="text-right p-3 font-medium">Invested</th>
                  <th className="text-right p-3 font-medium">Time</th>
                  <th className="text-center p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {positions.map((pos, i) => {
                  const pnl = (pos.pnl as number) || 0;
                  const pnlPct = (pos.pnl_pct as number) || 0;
                  const symbol = ((pos.symbol as string) || '').replace('.NS', '');
                  const confidence = (pos.confidence as number) || 0;
                  return (
                    <motion.tr
                      key={pos.id as number}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="hover:bg-white/[0.02]"
                    >
                      <td className="p-3">
                        <div className="font-medium">{symbol}</div>
                        <div className="text-[10px] text-gray-500">{confidence.toFixed(0)}% conf</div>
                      </td>
                      <td className="p-3 text-xs text-gray-400">{pos.option_strategy as string}</td>
                      <td className="p-3 text-right tabular-nums text-xs">{pos.strike_price as number || pos.strike as number || '—'}</td>
                      <td className="p-3 text-right tabular-nums">₹{formatNumber(pos.premium_entry as number)}</td>
                      <td className={`p-3 text-right tabular-nums font-medium ${getPnlColor(pnl)}`}>
                        ₹{formatNumber(pos.premium_current as number)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-accent-green text-xs">₹{formatNumber(pos.premium_target as number)}</td>
                      <td className="p-3 text-right tabular-nums text-accent-red text-xs">₹{formatNumber(pos.premium_sl as number)}</td>
                      <td className={`p-3 text-right tabular-nums font-medium ${getPnlColor(pnl)}`}>
                        {pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(pnl), 0)}
                      </td>
                      <td className={`p-3 text-right tabular-nums text-xs ${getPnlColor(pnlPct)}`}>
                        {formatPercent(pnlPct)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">{formatCurrency(pos.invested as number)}</td>
                      <td className="p-3 text-right text-[10px] text-gray-500 whitespace-nowrap">
                        {(pos.entry_time as string) || (pos.opened_at as string) || '—'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleClose(pos.id as number, pos.symbol as string)}
                          className="text-xs font-medium text-accent-red hover:text-white px-2.5 py-1 rounded-lg bg-accent-red/10 hover:bg-accent-red/25 border border-accent-red/20 transition-all"
                        >
                          Close
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td colSpan={7} className="p-3 text-right text-xs font-semibold text-gray-400">Total Unrealised P&L</td>
                  <td colSpan={2} className={`p-3 text-right tabular-nums font-bold ${getPnlColor(totalUnrealisedPnl)}`}>
                    {totalUnrealisedPnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(totalUnrealisedPnl), 0)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </motion.div>
    </>
  );
}

/* ─── Closed Trades Table ─── */

function ClosedTrades() {
  const { data, isLoading } = useBotPositions(10000);

  if (isLoading) return <SkeletonTable rows={3} cols={8} />;

  const trades = (data?.closed as Array<Record<string, unknown>>) || [];

  if (trades.length === 0) return null;

  const totalRealisedPnl = trades.reduce((sum, t) => sum + ((t.pnl as number) || 0), 0);
  const closedWins = trades.filter(t => ((t.pnl as number) || 0) > 0).length;
  const closedLosses = trades.filter(t => ((t.pnl as number) || 0) <= 0).length;
  const closedWinRate = trades.length > 0 ? (closedWins / trades.length) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h3 className="font-semibold flex items-center gap-2">
          <span>📋</span> Closed Trades
          <span className="text-xs text-gray-500 font-normal">({trades.length})</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-gray-500">
              <th className="text-left p-3 font-medium">Symbol</th>
              <th className="text-left p-3 font-medium">Strategy</th>
              <th className="text-right p-3 font-medium">Entry → Exit Prem</th>
              <th className="text-right p-3 font-medium">P&L</th>
              <th className="text-right p-3 font-medium">P&L%</th>
              <th className="text-left p-3 font-medium">Exit Reason</th>
              <th className="text-right p-3 font-medium">Duration</th>
              <th className="text-right p-3 font-medium">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {trades.map((t, i) => {
              const pnl = (t.pnl as number) || 0;
              const pnlPct = (t.pnl_pct as number) || 0;
              return (
                <motion.tr
                  key={t.id as number}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="hover:bg-white/[0.02]"
                >
                  <td className="p-3 font-medium">{((t.symbol as string) || '').replace('.NS', '')}</td>
                  <td className="p-3 text-xs text-gray-400">{t.option_strategy as string}</td>
                  <td className="p-3 text-right tabular-nums text-xs">
                    ₹{formatNumber(t.premium_entry as number)} → ₹{formatNumber(t.premium_exit as number)}
                  </td>
                  <td className={`p-3 text-right tabular-nums font-medium ${getPnlColor(pnl)}`}>
                    {pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(pnl), 0)}
                  </td>
                  <td className={`p-3 text-right tabular-nums text-xs ${getPnlColor(pnlPct)}`}>
                    {formatPercent(pnlPct)}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${exitReasonBadge(t.exit_reason as string)}`}>
                      {t.exit_reason as string}
                    </span>
                  </td>
                  <td className="p-3 text-right text-xs text-gray-400">
                    {durationStr(t.opened_at as string, t.closed_at as string)}
                  </td>
                  <td className="p-3 text-right text-xs text-gray-500 whitespace-nowrap">{t.closed_at as string}</td>
                </motion.tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.02]">
              <td colSpan={3} className="p-3 text-right text-xs font-semibold text-gray-400">Total Realised P&L</td>
              <td colSpan={2} className={`p-3 text-right tabular-nums font-bold ${getPnlColor(totalRealisedPnl)}`}>
                {totalRealisedPnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(totalRealisedPnl), 0)}
              </td>
              <td colSpan={3} className="p-3 text-right text-xs text-gray-400">
                {closedWins}W / {closedLosses}L • {closedWinRate.toFixed(0)}% win rate
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </motion.div>
  );
}

/* ─── Weekly P&L Chart ─── */

function WeeklyChart() {
  const { data, isLoading } = useBotWeekly(30000);

  if (isLoading) return <SkeletonChart height={200} />;

  const weekly = (data?.days as Array<Record<string, unknown>>) || [];

  if (weekly.length === 0) return null;

  const chartData = weekly.map(w => ({
    date: (w.date as string)?.slice(5),
    pnl: (w.pnl as number) || 0,
    capital: (w.capital as number) || 0,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <span>📊</span> Weekly P&L
      </h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d44" />
            <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} />
            <YAxis stroke="#555" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip
              contentStyle={{ background: '#151d2e', border: '1px solid #1e2d44', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#8892a4' }}
              formatter={(value) => [`₹${formatNumber(Number(value) || 0, 0)}`, 'P&L']}
            />
            <ReferenceLine y={0} stroke="#555" strokeDasharray="3 3" />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.pnl >= 0 ? '#00d4aa' : '#ff4757'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

/* ─── Activity Log ─── */

function ActivityLog() {
  const { data, isLoading } = useBotLog(10000);

  if (isLoading) return <SkeletonTable rows={5} cols={3} />;

  const logs = (data?.log as Array<Record<string, unknown>>) || [];

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h3 className="font-semibold flex items-center gap-2">
          <span>📝</span> Activity Log
          <span className="text-xs text-gray-500 font-normal">(last 30)</span>
        </h3>
      </div>
      {logs.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p>No activity yet</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.03] max-h-80 overflow-y-auto">
          {logs.slice(0, 30).map((log, i) => (
            <motion.div
              key={(log.id as number) || i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="p-3 flex items-start gap-3 text-xs hover:bg-white/[0.01]"
            >
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${eventBadge(log.event as string)}`}>
                {log.event as string}
              </span>
              <span className="text-gray-400 flex-1 leading-relaxed">{log.detail as string}</span>
              <span className="text-gray-600 shrink-0 whitespace-nowrap">{log.ts as string}</span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Bot Config Display ─── */

function BotConfig() {
  const { data, isLoading } = useBotStatus(10000);

  if (isLoading || !data) return null;

  const config = (data as Record<string, unknown>).config as Record<string, unknown> | undefined;
  if (!config || Object.keys(config).length === 0) return null;

  const items: { label: string; value: string }[] = [
    { label: 'Max Positions', value: String(config.max_positions ?? '—') },
    { label: 'Min Confidence', value: config.min_confidence ? `${config.min_confidence}%` : '—' },
    { label: 'Scan Interval', value: config.scan_interval ? `${config.scan_interval}s` : '—' },
    { label: 'Mode', value: String(config.mode ?? config.trading_mode ?? 'Paper') },
    { label: 'Capital Per Trade', value: config.capital_per_trade ? `₹${formatNumber(config.capital_per_trade as number, 0)}` : '—' },
    { label: 'Risk Per Trade', value: config.risk_per_trade ? `${config.risk_per_trade}%` : '—' },
  ].filter(item => item.value !== '—');

  if (items.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
        <span>⚙️</span> Bot Configuration
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {items.map(item => (
          <div key={item.label}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-medium mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Main Page ─── */

export default function AutoTraderPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Header />
      <PortfolioSummary />
      <OpenPositions />
      <ClosedTrades />
      <WeeklyChart />
      <ActivityLog />
      <BotConfig />
    </div>
  );
}
