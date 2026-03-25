'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  useNiftyData,
  useStockPrediction,
  useIndexData,
  useOrderFlow,
  useLivePrice,
  isMarketWindow,
} from '@/hooks/useMarketData';
import { formatNumber, formatPercent, formatCurrency, getSignalColor } from '@/lib/utils';
import SkeletonCard, { SkeletonChart } from '@/components/SkeletonLoader';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ───────── helpers ───────── */

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '1D'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function formatVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return v.toLocaleString('en-IN');
}

function getISTTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getMarketStatusColor(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'OPEN') return 'text-accent-green';
  if (s.includes('PRE')) return 'text-accent-gold';
  return 'text-accent-red';
}

interface Candle {
  t: string;
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
}

interface Strategy {
  name: string;
  signal: string;
  confidence: number;
  stop_loss: number;
  target: number;
  risk_reward: string;
}

interface Composite {
  signal: string;
  score: number;
  confidence: number;
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
}

interface LargeTrade {
  time: string;
  price: number;
  volume: number;
  type: string;
}

interface StockItem {
  symbol: string;
  price: number;
  change_pct: number;
  composite_signal?: string;
}

/* ═══════════════════════════════════════
   1. STATUS BAR
   ═══════════════════════════════════════ */

function StatusBar({
  marketStatus,
  dataSource,
}: {
  marketStatus: string;
  dataSource: string;
}) {
  const [clock, setClock] = useState(getISTTime());
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setClock(getISTTime());
      if (isMarketWindow()) {
        setCountdown((p) => (p <= 1 ? 5 : p - 1));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <div className="flex items-center gap-2">
        <span className="status-dot-live" />
        <span className="text-gray-400">LIVE</span>
        <span className={`font-semibold ${getMarketStatusColor(marketStatus)}`}>
          {marketStatus || 'CLOSED'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-gray-500">
        <span>📡 {dataSource || 'Yahoo Finance'}</span>
        {isMarketWindow() ? (
          <span>
            Refresh in{' '}
            <span className="text-accent-blue font-mono font-semibold">{countdown}s</span>
          </span>
        ) : (
          <span className="text-accent-gold">Market closed — no polling</span>
        )}
        <span className="text-accent-gold font-mono font-semibold tracking-wider">
          {clock} IST
        </span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   2. INDEX CARDS (clickable)
   ═══════════════════════════════════════ */

function IndexCard({
  symbol,
  label,
  active,
  onClick,
}: {
  symbol: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const { data } = useStockPrediction(symbol);
  const price = (data?.current_price as number) ?? 0;

  const indexData = useIndexData(symbol, '5m', 10000);
  const idx = indexData.data as Record<string, unknown> | undefined;
  const change = (idx?.change as number) ?? (data?.change as number) ?? 0;
  const changePct = (idx?.change_pct as number) ?? (data?.change_pct as number) ?? 0;

  const displayPrice = (idx?.price as number) ?? price;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`glass-card-hover p-4 text-left w-full transition-all cursor-pointer ${
        active ? 'border-accent-gold! shadow-[0_0_16px_rgba(255,215,0,0.15)]' : ''
      }`}
    >
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums">
        ₹{formatNumber(displayPrice)}
      </div>
      <div className="flex items-center gap-2 mt-1 text-sm">
        <span className={change >= 0 ? 'text-accent-green' : 'text-accent-red'}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
        </span>
        <span className={`text-xs ${changePct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          ({formatPercent(changePct)})
        </span>
      </div>
    </motion.button>
  );
}

/* ═══════════════════════════════════════
   3. CANDLESTICK CHART (Canvas)
   ═══════════════════════════════════════ */

function CandlestickChart({
  candles,
  currentPrice,
  timeframe,
  onTimeframeChange,
}: {
  candles: Candle[];
  currentPrice: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = 380;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const PADDING_LEFT = 10;
    const PADDING_RIGHT = 60;
    const PADDING_TOP = 10;
    const CHART_HEIGHT = H * 0.7;
    const VOL_HEIGHT = H * 0.2;
    const VOL_TOP = CHART_HEIGHT + 20;
    const chartW = W - PADDING_LEFT - PADDING_RIGHT;

    const allH = candles.map((c) => c.h);
    const allL = candles.map((c) => c.l);
    const priceMax = Math.max(...allH, currentPrice || 0);
    const priceMin = Math.min(...allL, currentPrice || Infinity);
    const pricePad = (priceMax - priceMin) * 0.08 || 10;
    const pMax = priceMax + pricePad;
    const pMin = priceMin - pricePad;
    const volMax = Math.max(...candles.map((c) => c.v), 1);

    const yPrice = (p: number) =>
      PADDING_TOP + ((pMax - p) / (pMax - pMin)) * CHART_HEIGHT;
    const yVol = (v: number) => VOL_TOP + VOL_HEIGHT - (v / volMax) * VOL_HEIGHT;

    const candleW = Math.max(2, (chartW / candles.length) * 0.7);
    const gap = chartW / candles.length;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const p = pMin + ((pMax - pMin) / gridSteps) * i;
      const y = yPrice(p);
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(W - PADDING_RIGHT, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(0), W - PADDING_RIGHT + 6, y + 3);
    }

    // Volume bars
    candles.forEach((c, i) => {
      const x = PADDING_LEFT + i * gap + gap / 2;
      const vH = (c.v / volMax) * VOL_HEIGHT;
      const bullish = c.c >= c.o;
      ctx.fillStyle = bullish ? 'rgba(0,212,170,0.25)' : 'rgba(255,71,87,0.25)';
      ctx.fillRect(x - candleW / 2, VOL_TOP + VOL_HEIGHT - vH, candleW, vH);
    });

    // Candles
    candles.forEach((c, i) => {
      const x = PADDING_LEFT + i * gap + gap / 2;
      const bullish = c.c >= c.o;
      const bodyTop = yPrice(Math.max(c.o, c.c));
      const bodyBot = yPrice(Math.min(c.o, c.c));
      const bodyH = Math.max(bodyBot - bodyTop, 1);

      // Wick
      ctx.strokeStyle = bullish ? '#00d4aa' : '#ff4757';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yPrice(c.h));
      ctx.lineTo(x, yPrice(c.l));
      ctx.stroke();

      // Body
      ctx.fillStyle = bullish ? '#00d4aa' : '#ff4757';
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    // Current price dashed line
    if (currentPrice > 0) {
      const y = yPrice(currentPrice);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(W - PADDING_RIGHT, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`► ${currentPrice.toFixed(2)}`, W - PADDING_RIGHT + 4, y - 4);
    }

    // X axis time labels
    const labelStep = Math.max(1, Math.floor(candles.length / 8));
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    candles.forEach((c, i) => {
      if (i % labelStep === 0) {
        const x = PADDING_LEFT + i * gap + gap / 2;
        ctx.fillText(c.t, x, H - 2);
      }
    });
  }, [candles, currentPrice]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          📈 Candlestick Chart
        </h3>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                timeframe === tf
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                  : 'bg-white/5 text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} className="w-full rounded" />
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   4. KEY LEVELS BAR
   ═══════════════════════════════════════ */

function KeyLevelsBar({
  atr,
  dayHigh,
  dayLow,
  prevClose,
  pivot,
  r1,
  s1,
}: {
  atr: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  pivot: number;
  r1: number;
  s1: number;
}) {
  const chips: { label: string; value: string; color: string }[] = [
    { label: 'ATR', value: atr.toFixed(1), color: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' },
    { label: 'Day High', value: dayHigh.toFixed(1), color: 'bg-accent-green/20 text-accent-green border-accent-green/30' },
    { label: 'Day Low', value: dayLow.toFixed(1), color: 'bg-accent-red/20 text-accent-red border-accent-red/30' },
    { label: 'Prev Close', value: prevClose.toFixed(1), color: 'bg-white/10 text-gray-300 border-white/10' },
    { label: 'Pivot', value: pivot.toFixed(1), color: 'bg-accent-gold/20 text-accent-gold border-accent-gold/30' },
    { label: 'R1', value: r1.toFixed(1), color: 'bg-accent-green/20 text-accent-green border-accent-green/30' },
    { label: 'S1', value: s1.toFixed(1), color: 'bg-accent-red/20 text-accent-red border-accent-red/30' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-2"
    >
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${c.color}`}
        >
          {c.label}: <span className="tabular-nums font-semibold">{c.value}</span>
        </span>
      ))}
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   5. STRATEGY SIGNALS TABLE
   ═══════════════════════════════════════ */

function StrategyTable({ strategies }: { strategies: Strategy[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <div className="p-4 border-b border-white/5">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          🎯 Strategy Signals
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-2 px-4 font-medium">Strategy</th>
              <th className="text-center py-2 px-2 font-medium">Signal</th>
              <th className="text-center py-2 px-2 font-medium">Confidence</th>
              <th className="text-right py-2 px-2 font-medium">SL</th>
              <th className="text-right py-2 px-2 font-medium">Target</th>
              <th className="text-right py-2 px-4 font-medium">R:R</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s, i) => {
              const isBuy = s.signal.toUpperCase().includes('BUY');
              const isSell = s.signal.toUpperCase().includes('SELL');
              const sigColor = isBuy
                ? 'text-accent-green'
                : isSell
                ? 'text-accent-red'
                : 'text-accent-gold';
              const barColor = isBuy
                ? 'bg-accent-green'
                : isSell
                ? 'bg-accent-red'
                : 'bg-accent-gold';

              return (
                <motion.tr
                  key={s.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                >
                  <td className="py-2 px-4 text-gray-300 font-medium">{s.name}</td>
                  <td className={`py-2 px-2 text-center font-semibold ${sigColor}`}>
                    {s.signal}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${s.confidence}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-gray-400 w-8 text-right">
                        {s.confidence}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-400">
                    {s.stop_loss?.toFixed(1) ?? '—'}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-400">
                    {s.target?.toFixed(1) ?? '—'}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-accent-blue font-medium">
                    {s.risk_reward || '—'}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   6. ORDER FLOW ANALYSIS
   ═══════════════════════════════════════ */

function OrderFlowPanel({ activeIndex }: { activeIndex: string }) {
  const { data } = useOrderFlow(activeIndex, 10000);
  const flow = data as Record<string, unknown> | undefined;

  const buyPct = (flow?.buy_pct as number) ?? 50;
  const sellPct = (flow?.sell_pct as number) ?? 50;
  const buyVol = (flow?.buy_volume as number) ?? 0;
  const sellVol = (flow?.sell_volume as number) ?? 0;
  const bias = (flow?.flow_bias as string) ?? 'NEUTRAL';
  const trades = (flow?.large_trades as LargeTrade[]) ?? [];

  const biasColor =
    bias === 'BULLISH'
      ? 'text-accent-green'
      : bias === 'BEARISH'
      ? 'text-accent-red'
      : 'text-accent-gold';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
        📊 Order Flow Analysis
      </h3>

      {/* Buy/Sell stacked bar */}
      <div className="flex h-5 rounded-full overflow-hidden mb-2">
        <div
          className="bg-accent-green flex items-center justify-center text-[10px] font-bold text-dark-900 transition-all duration-500"
          style={{ width: `${buyPct}%` }}
        >
          {buyPct}%
        </div>
        <div
          className="bg-accent-red flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
          style={{ width: `${sellPct}%` }}
        >
          {sellPct}%
        </div>
      </div>

      {/* Volume numbers */}
      <div className="flex justify-between text-xs mb-3">
        <span className="text-accent-green">Buy Vol: {formatVolume(buyVol)}</span>
        <span className="text-accent-red">Sell Vol: {formatVolume(sellVol)}</span>
      </div>

      {/* Flow bias */}
      <div className="text-center mb-3">
        <span className="text-xs text-gray-500">Flow Bias: </span>
        <span className={`font-bold text-sm ${biasColor}`}>{bias}</span>
      </div>

      {/* Recent Large Trades */}
      {trades.length > 0 && (
        <div>
          <h4 className="text-[11px] text-gray-500 font-medium mb-2">Recent Large Trades</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {trades.slice(0, 6).map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white/[0.02]"
              >
                <span className="text-gray-500 font-mono">{t.time}</span>
                <span className="tabular-nums text-gray-300">₹{formatNumber(t.price)}</span>
                <span className="tabular-nums text-gray-400">{formatVolume(t.volume)}</span>
                <span
                  className={`font-semibold ${
                    t.type === 'BUY' ? 'text-accent-green' : 'text-accent-red'
                  }`}
                >
                  {t.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   7. COMPOSITE SIGNAL (Right Panel)
   ═══════════════════════════════════════ */

function CompositeSignal({ composite }: { composite: Composite | null }) {
  if (!composite) return null;

  const { signal, score, confidence, bullish_count, bearish_count, neutral_count } = composite;
  const isBuy = signal.toUpperCase().includes('BUY');
  const isSell = signal.toUpperCase().includes('SELL');
  const sigColor = isBuy ? 'text-accent-green' : isSell ? 'text-accent-red' : 'text-accent-gold';
  const barBg = isBuy ? 'bg-accent-green' : isSell ? 'bg-accent-red' : 'bg-accent-gold';

  // Score meter: score is -1 to +1, map to 0-100
  const meterPct = ((score + 1) / 2) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 text-center"
    >
      <h3 className="text-xs text-gray-500 font-medium mb-3">COMPOSITE SIGNAL</h3>
      <motion.div
        key={signal}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`text-[32px] font-black ${sigColor} mb-2`}
      >
        {signal}
      </motion.div>
      <div className="text-xs text-gray-500 mb-4">
        Confidence: <span className="text-gray-300 font-semibold">{confidence}%</span>
      </div>

      {/* Score meter */}
      <div className="relative h-3 rounded-full bg-white/10 overflow-hidden mb-4">
        <motion.div
          className={`absolute left-0 top-0 h-full rounded-full ${barBg}`}
          initial={{ width: 0 }}
          animate={{ width: `${meterPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <div
          className="absolute top-0 w-0.5 h-full bg-white/50"
          style={{ left: '50%' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-4">
        <span>BEARISH</span>
        <span>Score: {score?.toFixed(2)}</span>
        <span>BULLISH</span>
      </div>

      {/* Signal counts */}
      <div className="flex justify-around text-xs">
        <div className="text-center">
          <div className="text-accent-green font-bold text-lg">{bullish_count}</div>
          <div className="text-gray-500">Bullish</div>
        </div>
        <div className="text-center">
          <div className="text-accent-gold font-bold text-lg">{neutral_count}</div>
          <div className="text-gray-500">Neutral</div>
        </div>
        <div className="text-center">
          <div className="text-accent-red font-bold text-lg">{bearish_count}</div>
          <div className="text-gray-500">Bearish</div>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   8. RISK/REWARD VISUAL
   ═══════════════════════════════════════ */

function RiskRewardVisual({
  strategies,
  currentPrice,
}: {
  strategies: Strategy[];
  currentPrice: number;
}) {
  // Use the top strategy for display
  const top = strategies[0];
  if (!top || !currentPrice) return null;

  const entry = currentPrice;
  const sl = top.stop_loss ?? 0;
  const tgt = top.target ?? 0;
  if (!sl || !tgt) return null;

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tgt - entry);
  const total = risk + reward || 1;
  const riskPct = (risk / total) * 100;
  const rewardPct = (reward / total) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      <h3 className="text-xs text-gray-500 font-medium mb-3">RISK / REWARD</h3>
      <div className="relative flex h-6 rounded-full overflow-hidden mb-2">
        <div
          className="bg-accent-red/80 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ width: `${riskPct}%` }}
        >
          Risk
        </div>
        <div
          className="bg-accent-green/80 flex items-center justify-center text-[10px] font-bold text-dark-900"
          style={{ width: `${rewardPct}%` }}
        >
          Reward
        </div>
        {/* Entry marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white"
          style={{ left: `${riskPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>SL: ₹{sl.toFixed(1)}</span>
        <span className="text-accent-gold font-semibold">Entry: ₹{entry.toFixed(1)}</span>
        <span>TGT: ₹{tgt.toFixed(1)}</span>
      </div>
      <div className="text-center mt-2 text-xs text-accent-blue font-semibold">
        R:R {top.risk_reward || `${(reward / risk).toFixed(1)}:1`}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   9. PIVOT POINTS
   ═══════════════════════════════════════ */

function PivotPoints({
  pivot,
  r1,
  r2,
  s1,
  s2,
}: {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}) {
  const levels = [
    { label: 'R2', value: r2, color: 'text-accent-green' },
    { label: 'R1', value: r1, color: 'text-accent-green' },
    { label: 'Pivot', value: pivot, color: 'text-accent-gold' },
    { label: 'S1', value: s1, color: 'text-accent-red' },
    { label: 'S2', value: s2, color: 'text-accent-red' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      <h3 className="text-xs text-gray-500 font-medium mb-3">PIVOT POINTS</h3>
      <div className="space-y-2">
        {levels.map((l) => (
          <div
            key={l.label}
            className={`flex items-center justify-between text-xs py-1.5 px-3 rounded ${
              l.label === 'Pivot'
                ? 'bg-accent-gold/10 border border-accent-gold/20'
                : 'bg-white/[0.03]'
            }`}
          >
            <span className={`font-semibold ${l.color}`}>{l.label}</span>
            <span className="tabular-nums text-gray-300 font-medium">
              ₹{l.value.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   10. TOP SIGNALS SCANNER MINI
   ═══════════════════════════════════════ */

function MiniScanner() {
  const { data, isLoading } = useNiftyData(60000);
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading || !data) return <SkeletonCard lines={4} />;

  const stocks = ((data.stocks as StockItem[]) ?? []).slice(0, 12);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      <h3 className="text-xs text-gray-500 font-medium mb-3">📡 TOP SIGNALS</h3>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {stocks.map((s) => {
          const pct = s.change_pct ?? 0;
          return (
            <button
              key={s.symbol}
              onClick={() => setSelected(selected === s.symbol ? null : s.symbol)}
              className={`w-full flex items-center justify-between text-[11px] py-1.5 px-2 rounded transition-all cursor-pointer ${
                selected === s.symbol
                  ? 'bg-accent-blue/10 border border-accent-blue/20'
                  : 'bg-white/[0.02] hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <span className="text-gray-300 font-medium truncate w-20 text-left">
                {s.symbol}
              </span>
              <span className="tabular-nums text-gray-400">₹{formatNumber(s.price)}</span>
              <span
                className={`tabular-nums font-medium ${
                  pct >= 0 ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {formatPercent(pct)}
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {selected && (
          <MiniStockDetail symbol={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniStockDetail({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useStockPrediction(symbol);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2 p-3 rounded-lg bg-dark-700/50 border border-white/5 overflow-hidden"
    >
      {isLoading ? (
        <div className="skeleton h-12" />
      ) : data ? (
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Price</span>
            <span className="text-gray-300 tabular-nums">
              ₹{formatNumber(data.current_price as number)}
            </span>
          </div>
          {data.consensus && (
            <div className="flex justify-between">
              <span className="text-gray-500">Signal</span>
              <span className={getSignalColor((data.consensus as Record<string, unknown>).signal as string)}>
                {(data.consensus as Record<string, unknown>).signal as string}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            className="text-[10px] text-accent-blue hover:underline mt-1 cursor-pointer"
          >
            Close
          </button>
        </div>
      ) : null}
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   MAIN DASHBOARD PAGE
   ═══════════════════════════════════════ */

export default function DashboardPage() {
  const [activeIndex, setActiveIndex] = useState<'nifty' | 'banknifty'>('nifty');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');

  // Main index data (chart, strategies, key levels etc) — refreshes every 10s
  const { data: indexRaw, isLoading: indexLoading } = useIndexData(activeIndex, timeframe, 10000);
  const idx = indexRaw as Record<string, unknown> | undefined;

  // Live price — refreshes every 5s
  const { data: liveRaw } = useLivePrice(activeIndex, 5000);
  const livePrice = (liveRaw as Record<string, unknown>)?.price as number | undefined;

  // Derived data from index response
  const price = livePrice ?? (idx?.price as number) ?? 0;
  const candles = (idx?.candles as Candle[]) ?? [];
  const strategies = (idx?.strategies as Strategy[]) ?? [];
  const composite = (idx?.composite as Composite) ?? null;
  const marketStatus = (idx?.market_status as string) ?? 'CLOSED';
  const dataSource = (idx?.data_source as string) ?? 'Yahoo Finance';

  const atr = (idx?.atr as number) ?? 0;
  const dayHigh = (idx?.day_high as number) ?? 0;
  const dayLow = (idx?.day_low as number) ?? 0;
  const prevClose = (idx?.prev_close as number) ?? 0;
  const pivot = (idx?.pivot as number) ?? 0;
  const r1 = (idx?.r1 as number) ?? 0;
  const r2 = (idx?.r2 as number) ?? 0;
  const s1 = (idx?.s1 as number) ?? 0;
  const s2 = (idx?.s2 as number) ?? 0;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* ── Status Bar ── */}
      <StatusBar marketStatus={marketStatus} dataSource={dataSource} />

      {/* ── Index Cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <IndexCard
          symbol="nifty"
          label="NIFTY 50"
          active={activeIndex === 'nifty'}
          onClick={() => setActiveIndex('nifty')}
        />
        <IndexCard
          symbol="banknifty"
          label="BANK NIFTY"
          active={activeIndex === 'banknifty'}
          onClick={() => setActiveIndex('banknifty')}
        />
      </div>

      {/* ── Two-column layout (left: chart+strats+orderflow | right: composite+rr+pivots+scanner) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Candlestick Chart */}
          {indexLoading && candles.length === 0 ? (
            <SkeletonChart height={380} />
          ) : (
            <CandlestickChart
              candles={candles}
              currentPrice={price}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />
          )}

          {/* Key Levels Bar */}
          {pivot > 0 && (
            <KeyLevelsBar
              atr={atr}
              dayHigh={dayHigh}
              dayLow={dayLow}
              prevClose={prevClose}
              pivot={pivot}
              r1={r1}
              s1={s1}
            />
          )}

          {/* Strategy Signals Table */}
          {strategies.length > 0 && <StrategyTable strategies={strategies} />}

          {/* Order Flow Analysis */}
          <OrderFlowPanel activeIndex={activeIndex} />
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Composite Signal */}
          <CompositeSignal composite={composite} />

          {/* Risk/Reward Visual */}
          {strategies.length > 0 && (
            <RiskRewardVisual strategies={strategies} currentPrice={price} />
          )}

          {/* Pivot Points */}
          {pivot > 0 && (
            <PivotPoints pivot={pivot} r1={r1} r2={r2} s1={s1} s2={s2} />
          )}

          {/* Mini Scanner */}
          <MiniScanner />
        </div>
      </div>
    </div>
  );
}
