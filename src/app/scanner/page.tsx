'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNiftyData, useStockDetail, useOptions } from '@/hooks/useMarketData';
import { formatNumber, formatPercent, getPnlColor, getSignalColor, getSignalBg, formatCurrency } from '@/lib/utils';
import SignalBadge from '@/components/SignalBadge';
import { SkeletonTable } from '@/components/SkeletonLoader';
import { API_BASE } from '@/lib/api';

/* ────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

interface StockRow {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  composite_signal: string;
  confidence: number;
  score: number;
  buy_signals: number;
  sell_signals: number;
  total_strategies: number;
}

interface OptionsLeg {
  action: string;
  strike: number;
  type: string;
  premium: number;
  delta?: number;
  theta?: number;
  vega?: number;
  gamma?: number;
  greeks?: { delta?: number; theta?: number; vega?: number; gamma?: number; iv?: number };
}

interface OptionsStrategy {
  name: string;
  bias: string;
  type: string;
  primary: boolean;
  description: string;
  risk_reward: string;
  legs: OptionsLeg[];
  net_premium: number;
  premium_target: number;
  premium_sl: number;
  target_return_pct: number;
  breakeven: number;
  max_loss_per_lot: number;
  max_profit_per_lot: string | number;
  risk: string;
  reward: string;
  underlying_target: number;
}

interface ChainRow {
  strike: number;
  ce_premium: number;
  pe_premium: number;
  ce_oi?: number;
  pe_oi?: number;
  ce_greeks: { delta: number };
  pe_greeks: { delta: number };
}

interface OptionsData {
  symbol: string;
  spot_price: number;
  atm_strike: number;
  expiry_date: string;
  expiry_type: string;
  days_to_expiry: number;
  iv_est_pct: number;
  hist_vol_pct: number;
  lot_size: number;
  consensus: string;
  real_data: boolean;
  strategies: OptionsStrategy[];
  chain: ChainRow[];
  error?: string;
}

type SortField = 'price' | 'change_pct' | 'confidence' | 'buy_ratio';

/* ────────────────────────────────────────────────────────────────────────────
 * HELPERS
 * ──────────────────────────────────────────────────────────────────────────── */

function buyRatio(s: StockRow): number {
  const total = s.buy_signals + s.sell_signals;
  return total > 0 ? s.buy_signals / total : 0.5;
}

function biasColor(bias: string): string {
  const b = bias?.toUpperCase() || '';
  if (b.includes('BULL')) return 'text-accent-green';
  if (b.includes('BEAR')) return 'text-accent-red';
  return 'text-accent-gold';
}

function biasBg(bias: string): string {
  const b = bias?.toUpperCase() || '';
  if (b.includes('BULL')) return 'bg-accent-green/10';
  if (b.includes('BEAR')) return 'bg-accent-red/10';
  return 'bg-accent-gold/10';
}

/* ────────────────────────────────────────────────────────────────────────────
 * OPTIONS SECTION
 * ──────────────────────────────────────────────────────────────────────────── */

function OptionsSection({ data }: { data: OptionsData }) {
  const strategies = data.strategies || [];
  const chain = data.chain || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4"
    >
      {/* Options Header Card */}
      <div className="glass-card p-4 border-l-4 border-accent-blue">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-accent-blue tracking-wide">📋 OPTIONS TRADING SETUP</h3>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Expiry: <span className="text-white font-medium">{data.expiry_date}</span></span>
            <span className="px-1.5 py-0.5 bg-accent-blue/10 text-accent-blue rounded text-[10px] font-semibold">
              {data.expiry_type}
            </span>
            <span>DTE: <span className="text-white font-medium">{data.days_to_expiry}</span></span>
            <span>IV: <span className="text-accent-gold font-medium">{data.iv_est_pct?.toFixed(1)}%</span></span>
            <span>Lot: <span className="text-white font-medium">{data.lot_size}</span></span>
          </div>
        </div>
      </div>

      {/* Quick Info Bar */}
      <div className="glass-card p-3 flex flex-wrap items-center gap-4 text-xs">
        <div>
          <span className="text-gray-500">Spot</span>
          <span className="ml-1.5 text-white font-bold">₹{formatNumber(data.spot_price)}</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div>
          <span className="text-gray-500">ATM</span>
          <span className="ml-1.5 text-white font-bold">{data.atm_strike}</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div>
          <span className="text-gray-500">HV%</span>
          <span className="ml-1.5 text-accent-purple font-medium">{data.hist_vol_pct?.toFixed(1)}%</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div>
          <span className="text-gray-500">IV%</span>
          <span className="ml-1.5 text-accent-gold font-medium">{data.iv_est_pct?.toFixed(1)}%</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <SignalBadge signal={data.consensus} size="sm" />
        <div className="ml-auto">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
            data.real_data
              ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              : 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
          }`}>
            {data.real_data ? '● NSE Live Data' : '○ Estimated Data'}
          </span>
        </div>
      </div>

      {/* Strategy Cards */}
      {strategies.map((strat, idx) => (
        <motion.div
          key={strat.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 * idx }}
          className={`glass-card overflow-hidden ${
            strat.primary ? 'border-accent-green/30 shadow-lg shadow-accent-green/5' : ''
          }`}
        >
          {/* Primary badge */}
          {strat.primary && (
            <div className="bg-gradient-to-r from-accent-green/20 to-transparent px-4 py-1.5 text-xs font-bold text-accent-green tracking-wide">
              ★ RECOMMENDED STRATEGY
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Strategy name row */}
            <div className="flex items-center flex-wrap gap-2">
              <h4 className="font-bold text-sm text-white">{strat.name}</h4>
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${biasBg(strat.bias)} ${biasColor(strat.bias)}`}>
                {strat.bias}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 font-medium">
                {strat.type}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue font-medium">
                R:R {strat.risk_reward}
              </span>
            </div>

            {/* Description */}
            {strat.description && (
              <p className="text-xs text-gray-400 italic">{strat.description}</p>
            )}

            {/* Legs Table */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-1.5 pr-3 font-medium">Action</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Strike</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Premium</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Δ</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Θ</th>
                    <th className="text-right py-1.5 font-medium">ν</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {(strat.legs || []).map((leg, li) => {
                    const g = (leg.greeks || leg) as Record<string, unknown>;
                    return (
                    <tr key={li}>
                      <td className="py-1.5 pr-3">
                        <span className={`font-bold ${
                          leg.action === 'BUY' ? 'text-accent-green' : 'text-accent-red'
                        }`}>
                          {leg.action}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-medium text-white">{leg.strike}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{leg.type}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-white">₹{typeof leg.premium === 'number' ? leg.premium.toFixed(2) : '—'}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-accent-blue">
                        {typeof g.delta === 'number' ? g.delta.toFixed(2) : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-accent-purple">
                        {typeof g.theta === 'number' ? g.theta.toFixed(2) : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-accent-gold">
                        {typeof g.vega === 'number' ? g.vega.toFixed(2) : '—'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Premium Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Net Premium</div>
                <div className="text-sm font-bold text-white">₹{strat.net_premium?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Target</div>
                <div className="text-sm font-bold text-accent-green">₹{strat.premium_target?.toFixed(2)}</div>
                <div className="text-[10px] text-accent-green">+{strat.target_return_pct}%</div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Stop Loss</div>
                <div className="text-sm font-bold text-accent-red">₹{strat.premium_sl?.toFixed(2)}</div>
                <div className="text-[10px] text-accent-red">
                  -{strat.net_premium ? ((1 - (strat.premium_sl ?? 0) / strat.net_premium) * 100).toFixed(0) : 0}%
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Breakeven</div>
                <div className="text-sm font-bold text-accent-blue">₹{strat.breakeven?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Max Loss/Lot</div>
                <div className="text-sm font-bold text-accent-red">
                  {typeof strat.max_loss_per_lot === 'number'
                    ? `₹${formatNumber(strat.max_loss_per_lot)}`
                    : String(strat.max_loss_per_lot)}
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Max Profit/Lot</div>
                <div className="text-sm font-bold text-accent-green">
                  {typeof strat.max_profit_per_lot === 'number'
                    ? `₹${formatNumber(strat.max_profit_per_lot)}`
                    : String(strat.max_profit_per_lot)}
                </div>
              </div>
            </div>

            {/* Risk / Reward summary */}
            <div className="flex flex-wrap gap-4 text-xs pt-1 border-t border-white/5">
              <span className="text-gray-500">Risk: <span className="text-accent-red font-medium">{strat.risk}</span></span>
              <span className="text-gray-500">Reward: <span className="text-accent-green font-medium">{strat.reward}</span></span>
              {strat.underlying_target != null && (
                <span className="text-gray-500">
                  Underlying Target: <span className="text-white font-medium">₹{formatNumber(strat.underlying_target)}</span>
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Options Chain Table */}
      {chain.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h4 className="text-xs font-bold text-gray-300 tracking-wide">OPTIONS CHAIN</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500">
                  {data.real_data && <th className="py-2 px-3 text-right font-medium">CE OI</th>}
                  <th className="py-2 px-3 text-right font-medium text-accent-green">CE Price</th>
                  <th className="py-2 px-3 text-right font-medium text-accent-green/60">CE Δ</th>
                  <th className="py-2 px-3 text-center font-bold text-white">Strike</th>
                  <th className="py-2 px-3 text-left font-medium text-accent-red/60">PE Δ</th>
                  <th className="py-2 px-3 text-left font-medium text-accent-red">PE Price</th>
                  {data.real_data && <th className="py-2 px-3 text-left font-medium">PE OI</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {chain.map((row) => {
                  const isATM = row.strike === data.atm_strike;
                  return (
                    <tr
                      key={row.strike}
                      className={isATM
                        ? 'bg-accent-blue/10 border-l-2 border-r-2 border-accent-blue/40'
                        : 'hover:bg-white/[0.02]'
                      }
                    >
                      {data.real_data && (
                        <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">
                          {row.ce_oi != null ? formatNumber(row.ce_oi, 0) : '—'}
                        </td>
                      )}
                      <td className="py-1.5 px-3 text-right tabular-nums text-accent-green font-medium">
                        {row.ce_premium?.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">
                        {row.ce_greeks?.delta?.toFixed(2)}
                      </td>
                      <td className={`py-1.5 px-3 text-center font-bold tabular-nums ${
                        isATM ? 'text-accent-blue' : 'text-white'
                      }`}>
                        {isATM && <span className="text-accent-gold mr-1">◇</span>}
                        {row.strike}
                      </td>
                      <td className="py-1.5 px-3 text-left tabular-nums text-gray-400">
                        {row.pe_greeks?.delta?.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-left tabular-nums text-accent-red font-medium">
                        {row.pe_premium?.toFixed(2)}
                      </td>
                      {data.real_data && (
                        <td className="py-1.5 px-3 text-left tabular-nums text-gray-500">
                          {row.pe_oi != null ? formatNumber(row.pe_oi, 0) : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * STOCK DETAIL MODAL
 * ──────────────────────────────────────────────────────────────────────────── */

function StockDetailModal({
  stock,
  onClose,
}: {
  stock: StockRow;
  onClose: () => void;
}) {
  const { data: prediction, isLoading: predLoading, error: predError } = useStockDetail(stock.symbol);
  const { data: optionsRaw, isLoading: optLoading, error: optError } = useOptions(stock.symbol);
  const options = optionsRaw as unknown as OptionsData | undefined;
  const [activeTab, setActiveTab] = useState<'models' | 'options'>('models');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 30 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-dark-800 rounded-2xl border border-white/10 w-full max-w-5xl mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="sticky top-0 z-10 bg-dark-800/95 backdrop-blur-md border-b border-white/5 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{stock.symbol.replace('.NS', '')}</h2>
                  <span className="text-sm text-gray-400">{stock.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-bold tabular-nums">₹{formatNumber(stock.price)}</span>
                  <span className={`text-sm font-medium tabular-nums ${getPnlColor(stock.change_pct)}`}>
                    {formatPercent(stock.change_pct)}
                  </span>
                  <SignalBadge signal={stock.composite_signal} confidence={stock.confidence} size="md" />
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {(['models', 'options'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'models' ? '🧠 AI Models' : '📋 Options Trading'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-5 space-y-5">
          <AnimatePresence mode="wait">
            {/* ── AI Models Tab ── */}
            {activeTab === 'models' && (
              <motion.div
                key="models"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                {predLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="glass-card p-4">
                        <div className="skeleton h-4 w-24 mb-3" />
                        <div className="skeleton h-8 w-20 mb-2" />
                        <div className="skeleton h-3 w-32" />
                      </div>
                    ))}
                  </div>
                ) : predError ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <p>⚠️ Failed to load prediction data</p>
                    <p className="text-xs text-gray-600 mt-1">{predError?.message || 'Network error'}</p>
                  </div>
                ) : prediction ? (
                  <>
                    {/* Models Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* ── Monte Carlo ── */}
                      {(() => {
                        const mc = (prediction as Record<string, unknown>).models
                          ? ((prediction as Record<string, unknown>).models as Record<string, unknown>)?.monte_carlo as Record<string, unknown> | undefined
                          : (prediction as Record<string, unknown>).monte_carlo as Record<string, unknown> | undefined;
                        if (!mc) return null;
                        const rawPredictions = mc.predictions as Record<string, unknown> | undefined;
                        // API returns predictions.day_1.mean, not predictions.mean directly
                        const day1 = rawPredictions?.day_1 as Record<string, unknown> | undefined;
                        const meanPrice = (day1?.mean ?? rawPredictions?.mean) as number | undefined;
                        const scenarios = mc.scenarios as Record<string, Record<string, unknown>> | undefined;
                        const riskMetrics = mc.risk_metrics as Record<string, number> | undefined;
                        const targetProbs = mc.target_probabilities as Record<string, unknown> | undefined;
                        return (
                          <div className="glass-card p-4 space-y-3">
                            <h4 className="text-xs font-semibold text-accent-blue flex items-center gap-1.5">
                              🎲 Monte Carlo Simulation
                            </h4>
                            <div>
                              <div className="text-[10px] text-gray-500 mb-0.5">Mean Price</div>
                              <div className="text-lg font-bold">
                                {meanPrice != null ? `₹${formatNumber(meanPrice)}` : '—'}
                              </div>
                            </div>
                            {/* Scenarios */}
                            {scenarios && (
                              <div className="grid grid-cols-3 gap-2 text-center">
                                {(['bull', 'base', 'bear'] as const).map((s) => {
                                  const sc = scenarios[s];
                                  if (!sc) return null;
                                  const color = s === 'bull' ? 'text-accent-green' : s === 'bear' ? 'text-accent-red' : 'text-accent-gold';
                                  return (
                                    <div key={s} className="bg-dark-700/50 rounded-lg p-2">
                                      <div className="text-[10px] text-gray-500 capitalize">{s}</div>
                                      <div className={`text-xs font-bold ${color}`}>
                                        ₹{formatNumber((sc.avg_price as number) ?? 0)}
                                      </div>
                                      {typeof sc.probability === 'number' && (
                                        <div className="text-[10px] text-gray-500">{(sc.probability as number).toFixed(0)}%</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Risk Metrics */}
                            {riskMetrics && (
                              <div className="text-[10px] text-gray-500 space-y-0.5">
                                {typeof riskMetrics.var_95 === 'number' && <div>VaR 95%: {riskMetrics.var_95.toFixed(1)}%</div>}
                                {typeof riskMetrics.max_drawdown === 'number' && (
                                  <div>Max Drawdown: {riskMetrics.max_drawdown.toFixed(1)}%</div>
                                )}
                              </div>
                            )}
                            {/* Target Probabilities */}
                            {targetProbs && typeof targetProbs === 'object' && (
                              <div className="flex flex-wrap gap-2 text-[10px]">
                                {Object.entries(targetProbs).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                                  <span key={k} className="text-accent-blue">{k}: {(v as number).toFixed(1)}%</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── FVP (Fair Value) ── */}
                      {(() => {
                        const fvp = (prediction as Record<string, unknown>).models
                          ? ((prediction as Record<string, unknown>).models as Record<string, unknown>)?.fvp as Record<string, unknown> | undefined
                          : (prediction as Record<string, unknown>).fvp as Record<string, unknown> | undefined;
                        if (!fvp) return null;
                        const components = fvp.components as Record<string, number> | undefined;
                        return (
                          <div className="glass-card p-4 space-y-3">
                            <h4 className="text-xs font-semibold text-accent-gold flex items-center gap-1.5">
                              💎 Fair Value (FVP)
                            </h4>
                            <div>
                              <div className="text-[10px] text-gray-500 mb-0.5">Fair Value</div>
                              <div className="text-lg font-bold">₹{formatNumber((fvp?.fair_value as number) ?? 0)}</div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={getSignalColor((fvp?.signal as string) ?? '')}>{(fvp?.signal as string) ?? ''}</span>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-400">{fvp?.premium_discount_pct != null && typeof fvp.premium_discount_pct === 'number' ? `${(fvp.premium_discount_pct as number).toFixed(2)}%` : ''}</span>
                            </div>
                            {/* Components */}
                            {components && (
                              <div className="space-y-1 text-[10px] text-gray-500">
                                {Object.entries(components).map(([k, v]) => (
                                  <div key={k} className="flex justify-between">
                                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                                    <span className="text-white tabular-nums">₹{formatNumber(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {fvp.z_score != null && (
                              <div className="text-[10px] text-gray-500">
                                Z-Score: <span className="text-white">{typeof fvp.z_score === 'number' ? (fvp.z_score as number).toFixed(2) : '—'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── AMD Model ── */}
                      {(() => {
                        const amd = (prediction as Record<string, unknown>).models
                          ? ((prediction as Record<string, unknown>).models as Record<string, unknown>)?.amd as Record<string, unknown> | undefined
                          : (prediction as Record<string, unknown>).amd as Record<string, unknown> | undefined;
                        if (!amd) return null;
                        const projection = amd.projection as Record<string, number> | undefined;
                        return (
                          <div className="glass-card p-4 space-y-3">
                            <h4 className="text-xs font-semibold text-accent-purple flex items-center gap-1.5">
                              🧠 AMD Model
                            </h4>
                            <div>
                              <div className="text-[10px] text-gray-500 mb-0.5">5D Projection</div>
                              <div className="text-lg font-bold">
                                {projection?.price_5d != null ? `₹${formatNumber(projection.price_5d)}` : '—'}
                              </div>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Regime:</span>
                                <span className="text-white">{(amd.regime as string) ?? ''}</span>
                              </div>
                              {amd.hurst_exponent != null && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">Hurst:</span>
                                  <span className="text-white">{typeof amd.hurst_exponent === 'number' ? (amd.hurst_exponent as number).toFixed(3) : '—'}</span>
                                  {typeof amd.hurst_interpretation === 'string' && (
                                    <span className="text-gray-400 text-[10px]">({amd.hurst_interpretation})</span>
                                  )}
                                </div>
                              )}
                              {amd.momentum != null && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">Momentum:</span>
                                  {typeof amd.momentum === 'object' ? (
                                    <span className={`${((amd.momentum as Record<string, unknown>).score as number) >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                                      {((amd.momentum as Record<string, unknown>).score as number)?.toFixed?.(1) ?? '—'}
                                    </span>
                                  ) : (
                                    <span className={`${(amd.momentum as number) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                      {typeof amd.momentum === 'number' ? (amd.momentum as number).toFixed(2) : '—'}
                                    </span>
                                  )}
                                </div>
                              )}
                              {amd.trend_strength != null && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">Strength:</span>
                                  <span className="text-white">{typeof amd.trend_strength === 'number' ? `${(amd.trend_strength as number).toFixed(0)}%` : '—'}</span>
                                </div>
                              )}
                            </div>
                            {/* Projection details */}
                            {projection && (
                              <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                                {projection.price_5d != null && (
                                  <div className="bg-dark-700/50 rounded p-1.5">
                                    <div className="text-gray-500">5-Day</div>
                                    <div className="text-accent-blue font-bold">₹{formatNumber(projection.price_5d)}</div>
                                  </div>
                                )}
                                {projection.price_10d != null && (
                                  <div className="bg-dark-700/50 rounded p-1.5">
                                    <div className="text-gray-500">10-Day</div>
                                    <div className="text-accent-purple font-bold">₹{formatNumber(projection.price_10d)}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Entry / Target / SL from scan data */}
                    {(() => {
                      const scan = (prediction as Record<string, unknown>).scan as Record<string, number> | undefined;
                      if (!scan?.entry) return null;
                      return (
                        <div className="glass-card p-4">
                          <h4 className="text-xs font-semibold text-gray-400 mb-3">📍 Trading Levels</h4>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Entry</div>
                              <div className="text-lg font-bold text-accent-blue">₹{formatNumber(scan.entry)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Target</div>
                              <div className="text-lg font-bold text-accent-green">
                                ₹{formatNumber(scan.target_1 ?? scan.target)}
                              </div>
                              {scan.target_prob != null && typeof scan.target_prob === 'number' && (
                                <div className="text-xs text-accent-green">{scan.target_prob.toFixed(0)}% prob</div>
                              )}
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Stop Loss</div>
                              <div className="text-lg font-bold text-accent-red">₹{formatNumber(scan.stop_loss)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">No prediction data available</div>
                )}
              </motion.div>
            )}

            {/* ── Options Tab ── */}
            {activeTab === 'options' && (
              <motion.div
                key="options"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                {optLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="glass-card p-4">
                        <div className="skeleton h-4 w-32 mb-3" />
                        <div className="skeleton h-20" />
                      </div>
                    ))}
                  </div>
                ) : options && !options.error ? (
                  <OptionsSection data={options} />
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No options data available for this stock
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * MAIN SCANNER PAGE
 * ──────────────────────────────────────────────────────────────────────────── */

export default function ScannerPage() {
  const { data, isLoading, error } = useNiftyData(30000);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [signalFilter, setSignalFilter] = useState<string>('all');
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);

  const stocks = useMemo(() => {
    let list = ((data?.stocks as unknown as StockRow[]) || []).map((s) => ({ ...s }));

    // Search filter
    if (search) {
      const q = search.toUpperCase();
      list = list.filter(
        (s) =>
          s.symbol?.toUpperCase().includes(q) ||
          s.name?.toUpperCase().includes(q),
      );
    }

    // Signal filter
    if (signalFilter !== 'all') {
      list = list.filter((s) =>
        s.composite_signal?.toUpperCase().includes(signalFilter.toUpperCase()),
      );
    }

    // Sort
    list.sort((a, b) => {
      let aVal: number, bVal: number;
      if (sortField === 'buy_ratio') {
        aVal = buyRatio(a);
        bVal = buyRatio(b);
      } else {
        aVal = (a[sortField] as number) ?? 0;
        bVal = (b[sortField] as number) ?? 0;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return list;
  }, [data, search, sortField, sortDir, signalFilter]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const updated = data?.updated as string | undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold gradient-text">Stock Scanner</h1>
        <p className="text-gray-500 text-sm mt-1">
          Nifty 50 Stocks • Auto-refresh 30s
          {updated && <span className="ml-2 text-gray-600">Last update: {updated}</span>}
        </p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search stocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-green/40 transition-colors"
          />
        </div>
        {['all', 'BUY', 'SELL', 'NEUTRAL'].map((f) => (
          <button
            key={f}
            onClick={() => setSignalFilter(f)}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
              signalFilter === f
                ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                : 'bg-dark-700 text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card p-4 border-accent-red/30 text-accent-red text-sm">
          Failed to load stock data. Retrying…
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <SkeletonTable rows={10} cols={6} />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-gray-500">
                  <th className="text-left p-3 font-medium">Stock</th>
                  <th
                    className="text-right p-3 font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('price')}
                  >
                    Price {sortField === 'price' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="text-right p-3 font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('change_pct')}
                  >
                    Change% {sortField === 'change_pct' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th className="text-center p-3 font-medium">Signal</th>
                  <th
                    className="text-right p-3 font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('confidence')}
                  >
                    Confidence {sortField === 'confidence' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="text-center p-3 font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('buy_ratio')}
                  >
                    Buy / Sell {sortField === 'buy_ratio' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {stocks.map((s, i) => {
                  const ratio = buyRatio(s);
                  return (
                    <motion.tr
                      key={s.symbol}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.5) }}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                      onClick={() => setSelectedStock(s)}
                    >
                      {/* Stock */}
                      <td className="p-3">
                        <div className="font-medium text-white">{s.symbol?.replace('.NS', '')}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[140px]">{s.name}</div>
                      </td>
                      {/* Price */}
                      <td className="p-3 text-right tabular-nums font-medium">₹{formatNumber(s.price)}</td>
                      {/* Change% */}
                      <td className={`p-3 text-right tabular-nums font-medium ${getPnlColor(s.change_pct)}`}>
                        {formatPercent(s.change_pct)}
                      </td>
                      {/* Signal Badge */}
                      <td className="p-3 text-center">
                        <SignalBadge signal={s.composite_signal} size="sm" />
                      </td>
                      {/* Confidence with bar */}
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-dark-500 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                s.confidence >= 80
                                  ? 'bg-accent-green'
                                  : s.confidence >= 60
                                    ? 'bg-accent-gold'
                                    : 'bg-accent-red'
                              }`}
                              style={{ width: `${Math.min(s.confidence, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-8 text-right">{s.confidence?.toFixed(0)}%</span>
                        </div>
                      </td>
                      {/* Buy/Sell Ratio */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-xs text-accent-green font-medium tabular-nums">{s.buy_signals}</span>
                          <div className="w-14 h-1.5 bg-dark-500 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-accent-green rounded-l-full"
                              style={{ width: `${ratio * 100}%` }}
                            />
                            <div
                              className="h-full bg-accent-red rounded-r-full"
                              style={{ width: `${(1 - ratio) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-accent-red font-medium tabular-nums">{s.sell_signals}</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stocks.length === 0 && !isLoading && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">No stocks match your filters</p>
              <p className="text-sm mt-1">Try adjusting your search or signal filter</p>
            </div>
          )}
        </div>
      )}

      {/* Stock Detail Modal */}
      <AnimatePresence>
        {selectedStock && (
          <StockDetailModal
            stock={selectedStock}
            onClose={() => setSelectedStock(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
