'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrediction, isMarketWindow } from '@/hooks/useMarketData';
import { formatNumber, formatPercent, getPnlColor, getSignalColor, getSignalBg } from '@/lib/utils';
import SignalBadge from '@/components/SignalBadge';
import SkeletonCard from '@/components/SkeletonLoader';

/* ─── Constants ─── */
const INDICES = [
  { value: 'NIFTY', label: 'NIFTY 50' },
  { value: 'BANKNIFTY', label: 'BANK NIFTY' },
];
const DAY_OPTIONS = [1, 3, 5, 10, 20];
const MODEL_TABS = [
  { key: 'all', label: 'All Models', icon: '📊' },
  { key: 'monte_carlo', label: 'Monte Carlo', icon: '🎲' },
  { key: 'fvp', label: 'FVP', icon: '💎' },
  { key: 'amd', label: 'AMD', icon: '🧠' },
];
const REFRESH_INTERVAL = 30000;

/* ─── Animation variants ─── */
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};
const stagger = {
  animate: { transition: { staggerChildren: 0.07 } },
};

/* ─── Helpers ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>;

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtPrice(v: unknown): string {
  return `₹${formatNumber(safeNum(v))}`;
}

function signalIcon(signal: string): string {
  const s = signal.toUpperCase();
  if (s.includes('BULL') || s.includes('BUY')) return '📈';
  if (s.includes('BEAR') || s.includes('SELL')) return '📉';
  return '➡️';
}

function regimeColor(regime: string): string {
  const r = regime.toUpperCase();
  if (r.includes('TRENDING-UP') || r.includes('TREND_UP')) return 'text-accent-green';
  if (r.includes('TRENDING-DOWN') || r.includes('TREND_DOWN')) return 'text-accent-red';
  if (r.includes('MEAN') || r.includes('LOW')) return 'text-accent-gold';
  if (r.includes('HIGH') || r.includes('VOLATILE')) return 'text-accent-red';
  return 'text-accent-blue';
}

/* ═══════════════════════════════════════════════════════════════════
   HISTOGRAM – Canvas-based price distribution
   ═══════════════════════════════════════════════════════════════════ */
function PriceHistogram({ bins, counts, currentPriceBin, currentPrice }: {
  bins: number[];
  counts: number[];
  currentPriceBin: number;
  currentPrice: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bins?.length || !counts?.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const maxCount = Math.max(...counts, 1);
    const barCount = counts.length;
    const pad = 40;
    const barW = Math.max(2, (W - pad * 2) / barCount - 1);
    const chartH = H - pad - 20;

    // Draw bars
    counts.forEach((c, i) => {
      const barH = (c / maxCount) * chartH;
      const x = pad + i * ((W - pad * 2) / barCount);
      const y = H - pad - barH;
      const isAbove = i >= currentPriceBin;
      ctx.fillStyle = isAbove ? 'rgba(0,212,170,0.6)' : 'rgba(255,71,87,0.6)';
      ctx.fillRect(x, y, barW, barH);
    });

    // Current price line
    const cpX = pad + currentPriceBin * ((W - pad * 2) / barCount) + barW / 2;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cpX, 10);
    ctx.lineTo(cpX, H - pad);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = '#ffd700';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Current: ₹${currentPrice.toLocaleString('en-IN')}`, cpX, 10);

    // X-axis labels (first, mid, last)
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    if (bins[0] != null) ctx.fillText(`₹${Math.round(bins[0])}`, pad, H - 5);
    ctx.textAlign = 'center';
    const midIdx = Math.floor(bins.length / 2);
    if (bins[midIdx] != null) ctx.fillText(`₹${Math.round(bins[midIdx])}`, W / 2, H - 5);
    ctx.textAlign = 'right';
    if (bins[bins.length - 1] != null) ctx.fillText(`₹${Math.round(bins[bins.length - 1])}`, W - pad, H - 5);
  }, [bins, counts, currentPriceBin, currentPrice]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height: 220 }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GAUGE BARS (reusable)
   ═══════════════════════════════════════════════════════════════════ */

function HorizontalGauge({ value, min, max, markers, gradient, height = 28 }: {
  value: number;
  min: number;
  max: number;
  markers?: { value: number; label: string; color: string }[];
  gradient: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="relative" style={{ height: height + 24 }}>
      <div className="relative rounded-full overflow-hidden" style={{ height, background: 'rgba(36,48,68,0.8)' }}>
        <div className="absolute inset-0 rounded-full" style={{ background: gradient, opacity: 0.3 }} />
        {/* Position indicator */}
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg shadow-white/30"
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>
      {/* Markers below */}
      {markers?.map((m, i) => {
        const mPct = Math.max(0, Math.min(100, ((m.value - min) / (max - min)) * 100));
        return (
          <div
            key={i}
            className="absolute text-[10px] font-medium"
            style={{ left: `${mPct}%`, top: height + 4, transform: 'translateX(-50%)', color: m.color }}
          >
            ▲ {m.label}
          </div>
        );
      })}
    </div>
  );
}

function MomentumGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const label = pct < 30 ? 'Bearish' : pct < 50 ? 'Weak' : pct < 70 ? 'Neutral' : pct < 85 ? 'Bullish' : 'Strong Bull';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Bearish</span>
        <span className="font-semibold text-white">{score}</span>
        <span>Bullish</span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #ff4757, #ff8c00, #ffd700, #00d4aa, #00b4d8)' }}>
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="absolute top-[-2px] bottom-[-2px] w-3 bg-white rounded-full border-2 border-dark-900 shadow-lg"
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="text-center text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function HurstGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span>0 (Mean-Rev)</span>
        <span>0.5 (Random)</span>
        <span>1 (Trending)</span>
      </div>
      <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #a855f7, #6b7280, #00d4aa)' }}>
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="absolute top-[-2px] bottom-[-2px] w-3 bg-white rounded-full border-2 border-dark-900 shadow-lg"
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FAIR VALUE GAUGE
   ═══════════════════════════════════════════════════════════════════ */
function FairValueGauge({ bollinger, fairValue, currentPrice }: {
  bollinger: { lower: number; upper: number; mid: number };
  fairValue: number;
  currentPrice: number;
}) {
  const lo = bollinger.lower * 0.998;
  const hi = bollinger.upper * 1.002;
  const range = hi - lo;
  const bbLoPct = ((bollinger.lower - lo) / range) * 100;
  const bbHiPct = ((bollinger.upper - lo) / range) * 100;
  const fvPct = Math.max(0, Math.min(100, ((fairValue - lo) / range) * 100));
  const cpPct = Math.max(0, Math.min(100, ((currentPrice - lo) / range) * 100));

  return (
    <div className="relative" style={{ height: 56 }}>
      <div className="relative h-6 mt-4 rounded-full" style={{ background: 'rgba(36,48,68,0.8)' }}>
        {/* Bollinger Band overlay */}
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${bbLoPct}%`,
            width: `${bbHiPct - bbLoPct}%`,
            background: 'rgba(168,85,247,0.2)',
            border: '1px solid rgba(168,85,247,0.4)',
          }}
        />
        {/* Fair Value marker */}
        <div
          className="absolute top-[-6px] bottom-[-6px] w-1 bg-accent-purple rounded-full"
          style={{ left: `${fvPct}%`, transform: 'translateX(-50%)' }}
        />
        {/* Current Price marker */}
        <div
          className="absolute top-[-6px] bottom-[-6px] w-1 bg-accent-green rounded-full"
          style={{ left: `${cpPct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px]">
        <span className="text-gray-500">₹{formatNumber(bollinger.lower)}</span>
        <div className="flex gap-4">
          <span className="text-accent-purple">◆ Fair Value</span>
          <span className="text-accent-green">◆ Current</span>
        </div>
        <span className="text-gray-500">₹{formatNumber(bollinger.upper)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: MONTE CARLO
   ═══════════════════════════════════════════════════════════════════ */
function MonteCarloSection({ mc, currentPrice }: { mc: AnyData; currentPrice: number }) {
  const predictions = mc.predictions || {};
  const scenarios = mc.scenarios || {};
  const targetProbs = mc.target_probabilities || {};
  const riskMetrics = mc.risk_metrics || {};
  const histogram = mc.histogram || {};
  const params = mc.parameters || {};

  // Get the last day prediction for the main forecast card
  const dayKeys = Object.keys(predictions).sort((a, b) => {
    const na = parseInt(a.replace('day_', ''));
    const nb = parseInt(b.replace('day_', ''));
    return na - nb;
  });
  const lastDay = dayKeys.length ? predictions[dayKeys[dayKeys.length - 1]] : {};

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-xl">🎲</span>
        <h2 className="text-lg font-bold text-accent-blue">Monte Carlo GBM</h2>
        <span className="text-xs text-gray-500 ml-auto">{safeNum(mc.simulations).toLocaleString()} simulations</span>
      </div>

      {/* Price Forecast Card */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Price Forecast</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-gray-500 text-sm">Current Price</span>
              <span className="text-xl font-bold tabular-nums">{fmtPrice(currentPrice)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-500 text-sm">Mean Forecast</span>
              <span className="text-xl font-bold text-accent-blue tabular-nums">{fmtPrice(lastDay.mean)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-500 text-sm">Median</span>
              <span className="text-lg font-semibold tabular-nums">{fmtPrice(lastDay.median)}</span>
            </div>
          </div>
          <div className="space-y-3">
            {/* 95% CI bar with 80% CI overlay */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Confidence Intervals</div>
              <div className="relative h-8 rounded-lg overflow-hidden" style={{ background: 'rgba(36,48,68,0.8)' }}>
                <div className="absolute inset-y-0 rounded-lg bg-accent-blue/15 border border-accent-blue/20" style={{
                  left: '5%', right: '5%',
                }} />
                <div className="absolute inset-y-1 rounded bg-accent-blue/30" style={{
                  left: '15%', right: '15%',
                }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-accent-blue left-1/2 transform -translate-x-1/2" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                <span>{fmtPrice(lastDay.ci_95_low)}</span>
                <span className="text-accent-blue">95% CI</span>
                <span>{fmtPrice(lastDay.ci_95_high)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-6">
                <span>{fmtPrice(lastDay.ci_80_low)}</span>
                <span className="text-accent-blue/70">80% CI</span>
                <span>{fmtPrice(lastDay.ci_80_high)}</span>
              </div>
            </div>
            {/* Bullish/Bearish probabilities */}
            <div className="flex gap-3">
              <div className="flex-1 text-center p-2 rounded-lg bg-accent-green/10 border border-accent-green/20">
                <div className="text-xs text-gray-500">Bullish</div>
                <div className="text-lg font-bold text-accent-green">{(safeNum(lastDay.bullish_prob) * 100).toFixed(1)}%</div>
              </div>
              <div className="flex-1 text-center p-2 rounded-lg bg-accent-red/10 border border-accent-red/20">
                <div className="text-xs text-gray-500">Bearish</div>
                <div className="text-lg font-bold text-accent-red">{(safeNum(lastDay.bearish_prob) * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Forecast Timeline */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Forecast Timeline</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {dayKeys.map((dk, i) => {
            const pred = predictions[dk] || {};
            const dayNum = dk.replace('day_', '');
            const mean = safeNum(pred.mean);
            const change = currentPrice > 0 ? ((mean - currentPrice) / currentPrice) * 100 : 0;
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() + parseInt(dayNum));
            const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return (
              <motion.div
                key={dk}
                variants={fadeUp}
                className="glass-card p-3 text-center border border-white/5 hover:border-accent-blue/30 transition-colors"
              >
                <div className="text-xs text-gray-500">Day {dayNum}</div>
                <div className="text-[10px] text-gray-600">{dateStr}</div>
                <div className="text-sm font-bold mt-1 tabular-nums">{fmtPrice(mean)}</div>
                <div className={`text-xs font-medium ${getPnlColor(change)}`}>{formatPercent(change)}</div>
                <div className="text-[10px] text-gray-600 mt-1">
                  {fmtPrice(pred.ci_95_low)} – {fmtPrice(pred.ci_95_high)}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Scenario Analysis + Target Hit Probability row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scenario Analysis */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Scenario Analysis</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['bull', 'base', 'bear'] as const).map((key) => {
              const sc = scenarios[key] || {};
              const prob = safeNum(sc.probability);
              const price = safeNum(sc.avg_price || sc.price);
              const colors = {
                bull: { bg: 'bg-accent-green/10', border: 'border-accent-green/20', text: 'text-accent-green', bar: 'bg-accent-green' },
                base: { bg: 'bg-accent-gold/10', border: 'border-accent-gold/20', text: 'text-accent-gold', bar: 'bg-accent-gold' },
                bear: { bg: 'bg-accent-red/10', border: 'border-accent-red/20', text: 'text-accent-red', bar: 'bg-accent-red' },
              };
              const c = colors[key];
              return (
                <div key={key} className={`${c.bg} border ${c.border} rounded-xl p-3 text-center`}>
                  <div className="text-xs text-gray-400 capitalize">{sc.label || `${key} Case`}</div>
                  <div className={`text-2xl font-bold ${c.text} mt-1`}>{prob}%</div>
                  <div className="w-full h-2 rounded-full bg-dark-700 mt-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${prob}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className={`h-full rounded-full ${c.bar}`}
                    />
                  </div>
                  <div className="text-xs font-semibold mt-2 tabular-nums">{fmtPrice(price)}</div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Target Hit Probability */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Target Hit Probability</h3>
          <div className="space-y-3">
            {/* Take-profit levels */}
            <div>
              <div className="text-xs text-gray-500 mb-2">Take-Profit Levels</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {['+1%', '+2%', '+5%', '+10%'].map((level) => {
                  const prob = safeNum(targetProbs[level]);
                  return (
                    <div key={level} className="flex items-center justify-between bg-dark-700/50 rounded-lg p-2">
                      <span className="text-xs text-accent-green font-medium">{level}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-dark-600 overflow-hidden">
                          <div className="h-full rounded-full bg-accent-green" style={{ width: `${prob}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-8 text-right">{prob}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Stop-loss levels */}
            <div>
              <div className="text-xs text-gray-500 mb-2">Stop-Loss Levels</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {['-1%', '-2%', '-5%'].map((level) => {
                  const prob = safeNum(targetProbs[level]);
                  return (
                    <div key={level} className="flex items-center justify-between bg-dark-700/50 rounded-lg p-2">
                      <span className="text-xs text-accent-red font-medium">{level}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-dark-600 overflow-hidden">
                          <div className="h-full rounded-full bg-accent-red" style={{ width: `${prob}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-8 text-right">{prob}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Risk Metrics + Histogram row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Metrics */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Risk Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'VaR 95%', key: 'var_95', color: 'text-accent-red' },
              { label: 'VaR 99%', key: 'var_99', color: 'text-accent-red' },
              { label: 'CVaR 95%', key: 'cvar_95', color: 'text-accent-red' },
              { label: 'Max Drawdown', key: 'max_drawdown', color: 'text-accent-red' },
              { label: 'Max Gain', key: 'max_gain', color: 'text-accent-green' },
            ].map((m) => (
              <div key={m.key} className="bg-dark-700/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500">{m.label}</div>
                <div className={`text-lg font-bold ${m.color} tabular-nums`}>
                  {formatPercent(safeNum(riskMetrics[m.key]))}
                </div>
              </div>
            ))}
          </div>
          {/* MC Parameters */}
          {params.daily_drift != null && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div>Daily Drift: {safeNum(params.daily_drift).toFixed(6)}</div>
              <div>Daily Vol: {safeNum(params.daily_volatility).toFixed(4)}</div>
              <div>Annual Vol: {(safeNum(params.annual_volatility) * 100).toFixed(1)}%</div>
              <div>Data Points: {safeNum(params.data_points_used)}</div>
            </div>
          )}
        </motion.div>

        {/* Price Distribution Histogram */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Price Distribution</h3>
          {histogram.bins?.length ? (
            <PriceHistogram
              bins={histogram.bins}
              counts={histogram.counts}
              currentPriceBin={safeNum(histogram.current_price_bin)}
              currentPrice={currentPrice}
            />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">No histogram data</div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: FAIR VALUE PRICE (FVP)
   ═══════════════════════════════════════════════════════════════════ */
function FVPSection({ fvp }: { fvp: AnyData }) {
  const fairValue = safeNum(fvp.fair_value);
  const currentPrice = safeNum(fvp.current_price);
  const premiumDiscount = safeNum(fvp.premium_discount_pct);
  const signal = (fvp.signal || 'NEUTRAL') as string;
  const components = fvp.components || {};
  const weights = fvp.weights || {};
  const bollinger = fvp.bollinger || { lower: 0, upper: 0, mid: 0 };
  const fibonacci = fvp.fibonacci || {};
  const sLevels = fvp.support_levels || [];
  const rLevels = fvp.resistance_levels || [];
  const zScore = safeNum(fvp.z_score);
  const reversionProb = safeNum(fvp.reversion_probability);

  const signalColorCls = signal.includes('UNDER') ? 'text-accent-green' : signal.includes('OVER') ? 'text-accent-red' : 'text-accent-gold';
  const signalBgCls = signal.includes('UNDER') ? 'bg-accent-green/10 border-accent-green/30' : signal.includes('OVER') ? 'bg-accent-red/10 border-accent-red/30' : 'bg-accent-gold/10 border-accent-gold/30';

  const componentConfig = [
    { key: 'ema_20', label: 'EMA 20' },
    { key: 'ema_50', label: 'EMA 50' },
    { key: 'sma_200', label: 'SMA 200' },
    { key: 'bb_mid', label: 'BB Mid' },
    { key: 'vwap', label: 'VWAP' },
    { key: 'fib_500', label: 'Fib 50%' },
  ];

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">💎</span>
        <h2 className="text-lg font-bold text-accent-purple">Fair Value Price (FVP)</h2>
      </div>

      {/* Fair Value vs Current */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Fair Value vs Current</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="text-center">
            <div className="text-xs text-gray-500">Fair Value</div>
            <div className="text-2xl font-bold text-accent-purple tabular-nums">{fmtPrice(fairValue)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Current Price</div>
            <div className="text-2xl font-bold tabular-nums">{fmtPrice(currentPrice)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Premium / Discount</div>
            <div className={`text-2xl font-bold tabular-nums ${getPnlColor(premiumDiscount)}`}>
              {formatPercent(premiumDiscount)}
            </div>
          </div>
          <div className="text-center">
            <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-bold ${signalBgCls} ${signalColorCls}`}>
              {signal.includes('UNDER') ? '📈' : signal.includes('OVER') ? '📉' : '➡️'} {signal}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Fair Value Gauge */}
      {bollinger.lower > 0 && (
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Fair Value Gauge</h3>
          <FairValueGauge bollinger={bollinger} fairValue={fairValue} currentPrice={currentPrice} />
        </motion.div>
      )}

      {/* Valuation Components */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Valuation Components</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {componentConfig.map((c) => {
            const val = safeNum(components[c.key]);
            const weight = safeNum(weights[c.key]);
            const diff = currentPrice > 0 ? ((val - currentPrice) / currentPrice) * 100 : 0;
            return (
              <div key={c.key} className="bg-dark-700/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{c.label}</span>
                  <span className="text-[10px] text-accent-purple/70">w: {(weight * 100).toFixed(0)}%</span>
                </div>
                <div className="text-sm font-bold tabular-nums">{fmtPrice(val)}</div>
                <div className={`text-xs ${getPnlColor(diff)}`}>{formatPercent(diff)} vs Current</div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Fibonacci + S/R and Z-Score row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fibonacci + S/R */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Fibonacci + Support / Resistance</h3>
          <div className="space-y-3">
            {/* Fibonacci */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-dark-700/50 rounded-lg p-2">
                <span className="text-gray-500">Swing High</span>
                <div className="font-semibold tabular-nums">{fmtPrice(fibonacci.swing_high)}</div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-2">
                <span className="text-gray-500">Swing Low</span>
                <div className="font-semibold tabular-nums">{fmtPrice(fibonacci.swing_low)}</div>
              </div>
              {(['fib_382', 'fib_500', 'fib_618'] as const).map((fk) => {
                const labels: Record<string, string> = { fib_382: 'Fib 38.2%', fib_500: 'Fib 50%', fib_618: 'Fib 61.8%' };
                return (
                  <div key={fk} className="bg-dark-700/50 rounded-lg p-2">
                    <span className="text-gray-500">{labels[fk]}</span>
                    <div className="font-semibold text-accent-purple tabular-nums">{fmtPrice(fibonacci[fk])}</div>
                  </div>
                );
              })}
            </div>
            {/* Support & Resistance */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-accent-green mb-1.5 font-medium">Support</div>
                {(sLevels as number[]).map((s: number, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5">
                    <span className="text-gray-500">S{i + 1}</span>
                    <span className="text-accent-green tabular-nums">{fmtPrice(s)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-accent-red mb-1.5 font-medium">Resistance</div>
                {(rLevels as number[]).map((r: number, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5">
                    <span className="text-gray-500">R{i + 1}</span>
                    <span className="text-accent-red tabular-nums">{fmtPrice(r)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Z-Score + Mean Reversion */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Z-Score + Mean Reversion</h3>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">Z-Score</div>
              <div className={`text-4xl font-bold tabular-nums ${zScore < -1 ? 'text-accent-green' : zScore > 1 ? 'text-accent-red' : 'text-accent-gold'}`}>
                {zScore.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {zScore < -2 ? 'Extremely Oversold' : zScore < -1 ? 'Oversold' : zScore > 2 ? 'Extremely Overbought' : zScore > 1 ? 'Overbought' : 'Neutral Zone'}
              </div>
            </div>
            {/* Z-Score gauge */}
            <div className="w-full max-w-xs">
              <HorizontalGauge
                value={zScore}
                min={-3}
                max={3}
                gradient="linear-gradient(to right, #00d4aa, #ffd700, #ff4757)"
                height={16}
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>-3</span><span>0</span><span>+3</span>
              </div>
            </div>
            <div className="text-center mt-2">
              <div className="text-xs text-gray-500 mb-1">Mean Reversion Probability</div>
              <div className="text-3xl font-bold text-accent-purple tabular-nums">{reversionProb}%</div>
              <div className="w-32 h-2 rounded-full bg-dark-700 mt-2 mx-auto overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${reversionProb}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-accent-purple"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: ADAPTIVE MARKET DYNAMICS (AMD)
   ═══════════════════════════════════════════════════════════════════ */
function AMDSection({ amd }: { amd: AnyData }) {
  const regime = (amd.regime || 'UNKNOWN') as string;
  const regimeDesc = (amd.regime_description || '') as string;
  const regimeAction = (amd.regime_action || '') as string;
  const hurst = safeNum(amd.hurst_exponent);
  const hurstInterp = (amd.hurst_interpretation || '') as string;
  const volatility = amd.volatility || {};
  const momentum = amd.momentum || {};
  const projection = amd.projection || {};

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🧠</span>
        <h2 className="text-lg font-bold text-accent-green">Adaptive Market Dynamics</h2>
      </div>

      {/* Market Regime */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Market Regime</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={`text-2xl font-bold ${regimeColor(regime)} uppercase`}>
            {regime.replace(/_/g, '-')}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm text-gray-300">{regimeDesc}</p>
            {regimeAction && (
              <p className="text-xs text-accent-gold">
                <span className="font-semibold">Action:</span> {regimeAction}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Hurst + Volatility row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hurst Exponent */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Hurst Exponent</h3>
          <div className="text-center mb-3">
            <span className="text-3xl font-bold tabular-nums">{hurst.toFixed(3)}</span>
            <span className="text-sm text-gray-500 ml-2">({hurstInterp})</span>
          </div>
          <HurstGauge value={hurst} />
        </motion.div>

        {/* Volatility */}
        <motion.div variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Volatility</h3>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-sm font-bold ${
              (volatility.regime || '').toString().toUpperCase().includes('HIGH') ? 'text-accent-red' :
              (volatility.regime || '').toString().toUpperCase().includes('LOW') ? 'text-accent-green' : 'text-accent-gold'
            }`}>
              {(volatility.regime || 'N/A').toString().toUpperCase()}
            </span>
            <span className="text-xs text-gray-500">— {volatility.description || ''}</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Recent (Annualized)</span>
                <span className="font-semibold tabular-nums">{safeNum(volatility.recent_annualized).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-dark-700 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, safeNum(volatility.recent_annualized) * 2)}%` }}
                  className="h-full rounded-full bg-accent-blue"
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Historical (Annualized)</span>
                <span className="font-semibold tabular-nums">{safeNum(volatility.historical_annualized).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-dark-700 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, safeNum(volatility.historical_annualized) * 2)}%` }}
                  className="h-full rounded-full bg-accent-purple"
                />
              </div>
            </div>
            {volatility.ratio != null && (
              <div className="text-xs text-gray-500 text-center">
                Ratio: <span className="font-semibold text-white">{safeNum(volatility.ratio).toFixed(2)}</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Momentum Dashboard */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Momentum Dashboard</h3>
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-9 gap-2">
          {[
            { label: 'Score', value: momentum.score, fmt: (v: number) => `${v}`, color: getPnlColor(safeNum(momentum.score) - 50) },
            { label: 'RSI', value: momentum.rsi, fmt: (v: number) => `${v.toFixed(1)}`, color: safeNum(momentum.rsi) > 70 ? 'text-accent-red' : safeNum(momentum.rsi) < 30 ? 'text-accent-green' : 'text-accent-gold' },
            { label: 'MACD Hist', value: momentum.macd_histogram, fmt: (v: number) => `${v.toFixed(1)}`, color: getPnlColor(safeNum(momentum.macd_histogram)) },
            { label: 'MACD Bias', value: momentum.macd_bias, fmt: (v: unknown) => String(v || 'N/A'), color: String(momentum.macd_bias).toUpperCase().includes('BULL') ? 'text-accent-green' : 'text-accent-red' },
            { label: 'ROC 10D', value: momentum.roc_10d, fmt: (v: number) => `${v.toFixed(2)}%`, color: getPnlColor(safeNum(momentum.roc_10d)) },
            { label: 'ROC 20D', value: momentum.roc_20d, fmt: (v: number) => `${v.toFixed(2)}%`, color: getPnlColor(safeNum(momentum.roc_20d)) },
            { label: 'ADX', value: momentum.adx, fmt: (v: number) => `${v.toFixed(1)}`, color: safeNum(momentum.adx) > 25 ? 'text-accent-green' : 'text-accent-gold' },
            { label: 'DI+', value: momentum.di_plus, fmt: (v: number) => `${v.toFixed(1)}`, color: 'text-accent-green' },
            { label: 'DI−', value: momentum.di_minus, fmt: (v: number) => `${v.toFixed(1)}`, color: 'text-accent-red' },
          ].map((m) => (
            <div key={m.label} className="bg-dark-700/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-500 leading-tight">{m.label}</div>
              <div className={`text-sm font-bold ${m.color} tabular-nums`}>
                {typeof m.value === 'string' ? m.fmt(m.value as unknown as number) : m.fmt(safeNum(m.value))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Momentum Gauge */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Momentum Gauge</h3>
        <MomentumGauge score={safeNum(momentum.score)} />
      </motion.div>

      {/* Adaptive Price Projection */}
      <motion.div variants={fadeUp} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Adaptive Price Projection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: '5-Day Target', price: projection.price_5d, change: projection.change_5d_pct },
            { label: '10-Day Target', price: projection.price_10d, change: projection.change_10d_pct },
          ].map((p) => (
            <div key={p.label} className="bg-dark-700/50 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-500">{p.label}</div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{fmtPrice(p.price)}</div>
              <div className={`text-sm font-medium mt-1 ${getPnlColor(safeNum(p.change))}`}>
                {formatPercent(safeNum(p.change))}
              </div>
            </div>
          ))}
        </div>
        {projection.method && (
          <div className="text-xs text-gray-500 text-center mt-3">
            Method: <span className="text-gray-400">{projection.method}</span>
            {projection.timeframe && <> • Timeframe: <span className="text-gray-400">{projection.timeframe}</span></>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CONSENSUS BOX
   ═══════════════════════════════════════════════════════════════════ */
function ConsensusBox({ consensus }: { consensus: AnyData }) {
  const signal = (consensus.signal || 'NEUTRAL') as string;
  const confidence = safeNum(consensus.confidence);
  const agree = safeNum(consensus.models_agree);
  const total = safeNum(consensus.total_models, 3);

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className="glass-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">🎯</span>
        <h2 className="text-lg font-bold gradient-text">Consensus</h2>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="text-center">
          <div className="text-4xl mb-1">{signalIcon(signal)}</div>
          <SignalBadge signal={signal} confidence={confidence} size="lg" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Confidence</span>
            <div className="flex-1 h-3 rounded-full bg-dark-700 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ duration: 0.8 }}
                className={`h-full rounded-full ${confidence > 70 ? 'bg-accent-green' : confidence > 40 ? 'bg-accent-gold' : 'bg-accent-red'}`}
              />
            </div>
            <span className="text-sm font-bold tabular-nums">{confidence.toFixed(1)}%</span>
          </div>
          <div className="text-sm text-gray-400">
            <span className="font-semibold text-white">{agree}</span> / {total} models agree
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function PredictionsPage() {
  const [index, setIndex] = useState('NIFTY');
  const [days, setDays] = useState(5);
  const [modelTab, setModelTab] = useState('all');
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const { data, error, isLoading, mutate } = usePrediction(index, days, modelTab, REFRESH_INTERVAL);

  // Countdown timer for auto-refresh (only during market hours)
  useEffect(() => {
    if (!isMarketWindow()) return;
    setCountdown(REFRESH_INTERVAL / 1000);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return REFRESH_INTERVAL / 1000;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  const handleRunAll = useCallback(() => {
    mutate();
    setCountdown(REFRESH_INTERVAL / 1000);
  }, [mutate]);

  const currentPrice = safeNum(data?.current_price);
  const models = data?.models || {};
  const mc = models.monte_carlo || null;
  const fvp = models.fvp || null;
  const amd = models.amd || null;
  const consensus = data?.consensus || null;

  const showMC = modelTab === 'all' || modelTab === 'monte_carlo';
  const showFVP = modelTab === 'all' || modelTab === 'fvp';
  const showAMD = modelTab === 'all' || modelTab === 'amd';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold gradient-text">AI Predictions</h1>
        <p className="text-gray-500 text-sm mt-1">Monte Carlo GBM + Fair Value + Adaptive Market Dynamics</p>
      </motion.div>

      {/* Controls Bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Index selector */}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Index</label>
              <select
                value={index}
                onChange={(e) => setIndex(e.target.value)}
                className="bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-green/40 transition-colors cursor-pointer"
              >
                {INDICES.map((idx) => (
                  <option key={idx.value} value={idx.value}>{idx.label}</option>
                ))}
              </select>
            </div>

            {/* Days selector */}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Days</label>
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      days === d
                        ? 'bg-accent-blue text-dark-900'
                        : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
                    }`}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>

            {/* Run All Models */}
            <div className="flex flex-col">
              <label className="text-[10px] text-gray-500 block mb-1">&nbsp;</label>
              <button
                onClick={handleRunAll}
                disabled={isLoading}
                className="px-5 py-2 bg-gradient-to-r from-accent-green to-accent-blue rounded-lg text-sm font-semibold text-dark-900 hover:shadow-lg hover:shadow-accent-green/20 transition-all disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
              >
                {isLoading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                ) : (
                  <span>▶</span>
                )}
                Run All Models
              </button>
            </div>

            {/* Auto-refresh countdown */}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none"
                    stroke="rgba(0,212,170,0.5)"
                    strokeWidth="3"
                    strokeDasharray={`${(countdown / (REFRESH_INTERVAL / 1000)) * 94.25} 94.25`}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] tabular-nums text-gray-400">{countdown}</span>
              </div>
              <span className="text-[10px] text-gray-500 hidden sm:inline">Auto-refresh</span>
            </div>
          </div>

          {/* Model tabs */}
          <div className="flex gap-1 mt-3 border-t border-white/5 pt-3">
            {MODEL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setModelTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  modelTab === tab.key
                    ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
                    : 'text-gray-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Content */}
      {isLoading && !data ? (
        <div className="space-y-4">
          <SkeletonCard lines={2} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={3} className="h-64" />
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-accent-red font-semibold">Failed to load predictions</p>
          <p className="text-sm text-gray-500 mt-1">The API might be reloading. Try again in a moment.</p>
          <button onClick={handleRunAll} className="mt-4 px-4 py-2 bg-dark-700 rounded-lg text-sm text-gray-300 hover:bg-dark-600 transition-colors">
            Retry
          </button>
        </div>
      ) : data ? (
        <AnimatePresence mode="wait">
          <motion.div key={`${index}-${days}-${modelTab}`} variants={stagger} initial="initial" animate="animate" exit="exit" className="space-y-6">
            {/* Current price header */}
            <motion.div variants={fadeUp} className="glass-card p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold">{data.name || index}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-3xl font-bold tabular-nums">{fmtPrice(currentPrice)}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{days}-day forecast • {safeNum(mc?.simulations, 5000).toLocaleString()} sims</div>
                  <div className="flex items-center gap-1.5 justify-end mt-1">
                    <span className="status-dot-live" />
                    <span className="text-accent-green">LIVE</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Consensus (only on "All Models" tab) */}
            {modelTab === 'all' && consensus && (
              <ConsensusBox consensus={consensus} />
            )}

            {/* Monte Carlo Section */}
            {showMC && mc && (
              <MonteCarloSection mc={mc} currentPrice={currentPrice} />
            )}
            {showMC && !mc && modelTab === 'monte_carlo' && (
              <div className="glass-card p-8 text-center text-gray-500">
                <span className="text-3xl block mb-2">🎲</span>
                Monte Carlo data not available for this configuration.
              </div>
            )}

            {/* FVP Section */}
            {showFVP && fvp && (
              <FVPSection fvp={fvp} />
            )}
            {showFVP && !fvp && modelTab === 'fvp' && (
              <div className="glass-card p-8 text-center text-gray-500">
                <span className="text-3xl block mb-2">💎</span>
                Fair Value Price data not available for this configuration.
              </div>
            )}

            {/* AMD Section */}
            {showAMD && amd && (
              <AMDSection amd={amd} />
            )}
            {showAMD && !amd && modelTab === 'amd' && (
              <div className="glass-card p-8 text-center text-gray-500">
                <span className="text-3xl block mb-2">🧠</span>
                Adaptive Market Dynamics data not available for this configuration.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold mb-2">Select an index and click Run All Models</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Our AI runs Monte Carlo simulation (5,000 paths), Fair Value analysis, and Adaptive Market Dynamics
            to give you a comprehensive multi-day prediction.
          </p>
        </div>
      )}
    </div>
  );
}
