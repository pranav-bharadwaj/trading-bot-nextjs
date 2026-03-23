'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { API_BASE } from '@/lib/api';
import { formatNumber, formatPercent, getPnlColor, getSignalColor, formatCurrency } from '@/lib/utils';
import SignalBadge from '@/components/SignalBadge';
import { SkeletonTable } from '@/components/SkeletonLoader';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScanStock {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  consensus: string;
  confidence: number;
  trade_dir: string;
  entry: number;
  target_1: number;
  target_2: number;
  stop_loss: number;
  risk_reward: number;
  target_prob: number;
  sl_prob: number;
  fvp_signal: string;
  premium_disc: string;
  amd_regime: string;
  momentum: number;
  rsi: number;
  vol_ratio: number;
  vol_spike: boolean;
  custom: boolean;
}

interface ScannerResponse {
  stocks: ScanStock[];
  total_scanned: number;
  total_stocks: number;
  scanning: boolean;
}

type SortField =
  | 'symbol' | 'price' | 'change_pct' | 'consensus' | 'confidence'
  | 'trade_dir' | 'entry' | 'target_1' | 'stop_loss' | 'risk_reward'
  | 'target_prob' | 'sl_prob' | 'fvp_signal' | 'premium_disc'
  | 'amd_regime' | 'momentum' | 'rsi' | 'vol_ratio';

type SignalFilterValue = 'ALL' | 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';

const SIGNAL_FILTERS: SignalFilterValue[] = ['ALL', 'STRONG BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG SELL'];

// ─── Helpers ────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json());

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function consensusBg(signal: string): string {
  const s = (signal ?? '').toUpperCase();
  if (s === 'STRONG BUY') return 'bg-accent-green/20 text-accent-green border border-accent-green/30';
  if (s === 'BUY') return 'bg-accent-green/10 text-accent-green/80 border border-accent-green/20';
  if (s === 'STRONG SELL') return 'bg-accent-red/20 text-accent-red border border-accent-red/30';
  if (s === 'SELL') return 'bg-accent-red/10 text-accent-red/80 border border-accent-red/20';
  return 'bg-accent-gold/10 text-accent-gold border border-accent-gold/20';
}

function confidenceColor(c: number): string {
  if (c >= 80) return 'text-accent-green';
  if (c >= 60) return 'text-accent-blue';
  if (c >= 40) return 'text-accent-gold';
  return 'text-accent-red';
}

function rrColor(rr: number): string {
  if (rr >= 3) return 'text-accent-green font-bold';
  if (rr >= 2) return 'text-accent-green';
  if (rr >= 1.5) return 'text-accent-blue';
  if (rr >= 1) return 'text-accent-gold';
  return 'text-accent-red';
}

function fvpBadge(signal: string): { text: string; cls: string } {
  const s = (signal ?? '').toUpperCase();
  if (s.includes('UNDER')) return { text: 'UNDERVALUED', cls: 'bg-accent-green/10 text-accent-green border-accent-green/20' };
  if (s.includes('OVER')) return { text: 'OVERVALUED', cls: 'bg-accent-red/10 text-accent-red border-accent-red/20' };
  return { text: 'NEUTRAL', cls: 'bg-accent-gold/10 text-accent-gold border-accent-gold/20' };
}

function parsePremDisc(val: string): { num: number; label: string } {
  const n = parseFloat((val ?? '0').replace('%', ''));
  return { num: n, label: val ?? '—' };
}

function rsiColor(rsi: number): string {
  if (rsi < 30) return 'text-accent-red';
  if (rsi > 70) return 'text-accent-green';
  return 'text-accent-gold';
}

// ─── Stock Detail Modal ─────────────────────────────────────────────────────

function StockDetailModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { data: prediction, isLoading: predLoading } = useSWR(
    `${API_BASE}/api/stock_predict/${encodeURIComponent(symbol)}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: options, isLoading: optLoading } = useSWR(
    `${API_BASE}/api/options/${encodeURIComponent(symbol)}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-dark-800 rounded-2xl border border-white/10 w-full max-w-4xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-dark-800/95 backdrop-blur-md border-b border-white/5 p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold">{symbol.replace('.NS', '')}</h2>
            <p className="text-xs text-gray-500">AI Analysis • Monte Carlo • FVP • AMD • Options</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {predLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-card p-4">
                  <div className="skeleton h-4 w-24 mb-3" />
                  <div className="skeleton h-8 w-20 mb-2" />
                  <div className="skeleton h-3 w-32" />
                </div>
              ))}
            </div>
          ) : prediction && !prediction.error ? (
            <div className="space-y-4">
              {/* Price + consensus */}
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold">₹{formatNumber(prediction.current_price as number)}</span>
                {Boolean((prediction.consensus as Record<string, unknown>)?.signal) && (
                  <SignalBadge
                    signal={(prediction.consensus as Record<string, unknown>).signal as string}
                    confidence={(prediction.consensus as Record<string, unknown>).confidence as number}
                    size="lg"
                  />
                )}
              </div>

              {/* MC + FVP + AMD */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Monte Carlo */}
                {(() => {
                  const mc = (prediction.models as Record<string, unknown>)?.monte_carlo as Record<string, unknown> | undefined;
                  if (!mc) return null;
                  const predictions = mc.predictions as Record<string, Record<string, number>> | undefined;
                  const scenarios = mc.scenarios as Record<string, Record<string, number>> | undefined;
                  const riskMetrics = mc.risk_metrics as Record<string, number> | undefined;
                  const day5 = predictions?.day_5;
                  return (
                    <div className="glass-card p-4">
                      <h4 className="text-xs font-semibold text-accent-blue mb-2">🎲 Monte Carlo</h4>
                      <div className="text-lg font-bold">
                        {day5?.mean != null ? `₹${formatNumber(day5.mean)}` : '—'}
                      </div>
                      {day5?.ci_lower != null && day5?.ci_upper != null && (
                        <div className="text-xs text-gray-500 mt-1">
                          CI: ₹{formatNumber(day5.ci_lower)} – ₹{formatNumber(day5.ci_upper)}
                        </div>
                      )}
                      {scenarios && (
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          {scenarios.bull && <div className="text-accent-green">Bull: ₹{formatNumber(scenarios.bull.target ?? scenarios.bull.price ?? 0)}</div>}
                          {scenarios.base && <div className="text-accent-blue">Base: ₹{formatNumber(scenarios.base.target ?? scenarios.base.price ?? 0)}</div>}
                          {scenarios.bear && <div className="text-accent-red">Bear: ₹{formatNumber(scenarios.bear.target ?? scenarios.bear.price ?? 0)}</div>}
                        </div>
                      )}
                      {riskMetrics?.var_95 != null && (
                        <div className="text-xs text-accent-red mt-1">VaR 95%: {riskMetrics.var_95.toFixed(1)}%</div>
                      )}
                    </div>
                  );
                })()}

                {/* FVP */}
                {(() => {
                  const fvp = (prediction.models as Record<string, unknown>)?.fvp as Record<string, unknown> | undefined;
                  if (!fvp) return null;
                  return (
                    <div className="glass-card p-4">
                      <h4 className="text-xs font-semibold text-accent-gold mb-2">💎 Fair Value (FVP)</h4>
                      <div className="text-lg font-bold">₹{formatNumber(fvp.fair_value as number)}</div>
                      <div className="text-xs mt-1">
                        <span className={getSignalColor(fvp.signal as string)}>{fvp.signal as string}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Premium/Discount: {fvp.premium_discount as string}</div>
                      {fvp.components != null && (
                        <div className="text-xs text-gray-500 mt-1">
                          {Object.entries(fvp.components as Record<string, number>).slice(0, 3).map(([k, v]: [string, number]) => (
                            <div key={k}>{k}: ₹{formatNumber(v)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* AMD */}
                {(() => {
                  const amd = (prediction.models as Record<string, unknown>)?.amd as Record<string, unknown> | undefined;
                  if (!amd) return null;
                  const projection = amd.projection as Record<string, number> | undefined;
                  return (
                    <div className="glass-card p-4">
                      <h4 className="text-xs font-semibold text-accent-purple mb-2">🧠 AMD Model</h4>
                      <div className="text-lg font-bold">
                        {projection?.target != null ? `₹${formatNumber(projection.target)}` : '—'}
                      </div>
                      <div className="text-xs mt-1">
                        <span className="text-gray-400">{amd.regime as string}</span>
                        <span className="text-gray-500 ml-2">Strength: {(((amd.trend_strength as number) ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Momentum: {(amd.momentum as number)?.toFixed(2)} • {amd.hurst_interpretation as string}
                      </div>
                      {projection?.stop_loss != null && (
                        <div className="text-xs text-accent-red mt-1">Projection SL: ₹{formatNumber(projection.stop_loss)}</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Entry/Target/SL */}
              {(() => {
                const scan = prediction.scan as Record<string, number> | undefined;
                if (!scan?.entry) return null;
                return (
                  <div className="glass-card p-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-3">📍 Trading Levels</h4>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Entry</div>
                        <div className="text-lg font-bold text-accent-blue">₹{formatNumber(scan.entry)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Target 1</div>
                        <div className="text-lg font-bold text-accent-green">₹{formatNumber(scan.target_1)}</div>
                        {scan.target_prob != null && (
                          <div className="text-xs text-accent-green">{scan.target_prob.toFixed(0)}% prob</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Target 2</div>
                        <div className="text-lg font-bold text-accent-green/70">
                          {scan.target_2 != null ? `₹${formatNumber(scan.target_2)}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Stop Loss</div>
                        <div className="text-lg font-bold text-accent-red">₹{formatNumber(scan.stop_loss)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Failed to load prediction data</div>
          )}

          {/* Options Analysis */}
          {optLoading ? (
            <div className="glass-card p-4">
              <div className="skeleton h-4 w-32 mb-3" />
              <div className="skeleton h-20" />
            </div>
          ) : options && !options.error ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <span>📋</span> Options Analysis
                <span className="text-xs text-gray-500">
                  IV: {((options.iv as number) * 100).toFixed(1)}% • Expiry: {options.expiry as string}
                </span>
              </h4>

              {/* Strategy cards */}
              {options.strategies && Object.entries(options.strategies as Record<string, Record<string, unknown>>).map(([name, strat]) => (
                <div key={name} className={`glass-card p-4 ${name === options.recommended_strategy ? 'border-accent-green/30 shadow-accent-green/10 shadow-md' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-sm">
                      {name === options.recommended_strategy && <span className="text-accent-green mr-1">★</span>}
                      {name}
                    </h5>
                    <span className="text-xs text-gray-500">Lot: {strat.lot_size as number}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Premium</span>
                      <div className="font-bold">₹{formatNumber(strat.net_premium as number)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Target</span>
                      <div className="font-bold text-accent-green">₹{formatNumber(strat.premium_target as number)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Stop Loss</span>
                      <div className="font-bold text-accent-red">₹{formatNumber(strat.premium_sl as number)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Investment</span>
                      <div className="font-bold">{formatCurrency(strat.total_investment as number)}</div>
                    </div>
                  </div>
                  {/* Greeks */}
                  {strat.greeks != null && (
                    <div className="grid grid-cols-4 gap-3 text-xs mt-2 pt-2 border-t border-white/5">
                      {Object.entries(strat.greeks as Record<string, number>).map(([k, v]: [string, number]) => (
                        <div key={k}>
                          <span className="text-gray-500 capitalize">{k}</span>
                          <div className="font-medium">{typeof v === 'number' ? v.toFixed(4) : String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Legs */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {((strat.legs as Array<Record<string, unknown>>) || []).map((leg, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded ${
                        leg.type === 'BUY' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
                      }`}>
                        {leg.type as string} {leg.strike as number} {leg.option_type as string} @₹{formatNumber(leg.premium as number)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Options chain table */}
              {options.chain && (
                <div className="glass-card overflow-hidden">
                  <h5 className="text-xs font-semibold text-gray-400 p-3 border-b border-white/5">Options Chain</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-500">
                          <th className="p-2 text-left">Strike</th>
                          <th className="p-2 text-right">CE LTP</th>
                          <th className="p-2 text-right">CE OI</th>
                          <th className="p-2 text-right">PE LTP</th>
                          <th className="p-2 text-right">PE OI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {(options.chain as Array<Record<string, unknown>>).slice(0, 10).map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.02]">
                            <td className="p-2 font-medium">{row.strike as number}</td>
                            <td className="p-2 text-right">{formatNumber((row.ce_ltp ?? 0) as number)}</td>
                            <td className="p-2 text-right text-gray-500">{((row.ce_oi ?? 0) as number).toLocaleString()}</td>
                            <td className="p-2 text-right">{formatNumber((row.pe_ltp ?? 0) as number)}</td>
                            <td className="p-2 text-right text-gray-500">{((row.pe_oi ?? 0) as number).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AiScannerPage() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [signalFilter, setSignalFilter] = useState<SignalFilterValue>('ALL');
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [customScanning, setCustomScanning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Build the API URL with server-side sort/filter params
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('sort', sortField);
    params.set('order', sortDir);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (signalFilter !== 'ALL') params.set('signal', signalFilter);
    return `${API_BASE}/api/ai_scanner?${params.toString()}`;
  }, [sortField, sortDir, debouncedSearch, signalFilter]);

  const { data, isLoading, error, mutate: mutateScan } = useSWR<ScannerResponse>(
    apiUrl,
    fetcher,
    {
      refreshInterval: (latestData) => {
        const d = latestData as ScannerResponse | undefined;
        return d?.scanning ? 5000 : 60000;
      },
      revalidateOnFocus: true,
      dedupingInterval: 3000,
    }
  );

  const isScanning = data?.scanning ?? false;
  const totalScanned = data?.total_scanned ?? 0;
  const totalStocks = data?.total_stocks ?? 0;
  const scanProgress = totalStocks > 0 ? (totalScanned / totalStocks) * 100 : 0;

  // Client-side filtering & sorting as fallback
  const stocks = useMemo(() => {
    let list = data?.stocks ?? [];

    if (debouncedSearch) {
      const q = debouncedSearch.toUpperCase();
      list = list.filter(s =>
        s.symbol?.toUpperCase().includes(q) ||
        s.name?.toUpperCase().includes(q)
      );
    }

    if (signalFilter !== 'ALL') {
      list = list.filter(s => s.consensus?.toUpperCase() === signalFilter);
    }

    list = [...list].sort((a, b) => {
      let aVal: string | number = (a as unknown as Record<string, string | number>)[sortField] ?? 0;
      let bVal: string | number = (b as unknown as Record<string, string | number>)[sortField] ?? 0;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'desc' ? 1 : -1;
      if (aVal > bVal) return sortDir === 'desc' ? -1 : 1;
      return 0;
    });

    return list;
  }, [data, debouncedSearch, signalFilter, sortField, sortDir]);

  // Summary stats
  const buyCount = useMemo(() => (data?.stocks ?? []).filter(s => s.consensus?.toUpperCase().includes('BUY')).length, [data]);
  const sellCount = useMemo(() => (data?.stocks ?? []).filter(s => s.consensus?.toUpperCase().includes('SELL')).length, [data]);
  const neutralCount = useMemo(() => (data?.stocks ?? []).filter(s => {
    const c = s.consensus?.toUpperCase() ?? '';
    return !c.includes('BUY') && !c.includes('SELL');
  }).length, [data]);
  const volSpikeStocks = useMemo(() => (data?.stocks ?? []).filter(s => s.vol_spike), [data]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }, [sortField]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-600 ml-0.5">⇅</span>;
    return <span className="text-accent-green ml-0.5">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  // Custom stock scan
  const handleScanCustom = useCallback(async () => {
    const sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    const fullSym = sym.includes('.') ? sym : `${sym}.NS`;
    setCustomScanning(true);
    try {
      await fetch(`${API_BASE}/api/ai_scanner/custom?symbol=${encodeURIComponent(fullSym)}`, { method: 'POST' });
      await mutateScan();
      setSearchInput('');
    } catch { /* ignore */ }
    setCustomScanning(false);
  }, [searchInput, mutateScan]);

  const handleRefresh = useCallback(() => {
    mutateScan();
  }, [mutateScan]);

  const isValidTicker = /^[A-Z]{2,20}$/i.test(searchInput.trim());
  const tickerNotInList = isValidTicker && !(data?.stocks ?? []).some(
    s => s.symbol?.replace('.NS', '').toUpperCase() === searchInput.trim().toUpperCase()
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold gradient-text">AI Scanner</h1>
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                isScanning
                  ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/30'
                  : 'bg-accent-green/10 text-accent-green border-accent-green/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isScanning ? 'bg-accent-blue animate-pulse' : 'bg-accent-green'}`} />
                {isScanning ? 'Scanning...' : 'Ready'}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {totalScanned}/{totalStocks} stocks • Auto-refreshes {isScanning ? 'every 5s' : 'every 60s'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search or add stock..."
                className="pl-10 pr-4 py-2 bg-dark-700 border border-white/5 rounded-xl text-sm w-56 focus:outline-none focus:border-accent-green/40 transition-colors"
              />
            </div>

            {/* Signal filter dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-dark-700 border border-white/5 rounded-xl text-sm text-gray-300 hover:border-white/10 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  signalFilter === 'ALL' ? 'bg-gray-500' :
                  signalFilter.includes('BUY') ? 'bg-accent-green' :
                  signalFilter.includes('SELL') ? 'bg-accent-red' : 'bg-accent-gold'
                }`} />
                {signalFilter === 'ALL' ? 'All Signals' : signalFilter}
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute right-0 mt-1 w-44 bg-dark-700 border border-white/10 rounded-xl shadow-xl z-30 overflow-hidden"
                  >
                    {SIGNAL_FILTERS.map(f => (
                      <button
                        key={f}
                        onClick={() => { setSignalFilter(f); setDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5 transition-colors ${
                          signalFilter === f ? 'text-accent-green bg-accent-green/5' : 'text-gray-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          f === 'ALL' ? 'bg-gray-500' :
                          f.includes('BUY') ? 'bg-accent-green' :
                          f.includes('SELL') ? 'bg-accent-red' : 'bg-accent-gold'
                        }`} />
                        {f === 'ALL' ? 'All Signals' : f}
                        {signalFilter === f && <span className="ml-auto text-accent-green">✓</span>}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              className="p-2 bg-dark-700 border border-white/5 rounded-xl hover:border-white/10 transition-colors"
              title="Refresh"
            >
              <svg className={`w-4 h-4 text-gray-400 ${isScanning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scan new stock button */}
        {tickerNotInList && searchInput.trim() && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <button
              onClick={handleScanCustom}
              disabled={customScanning}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-green/20 to-accent-blue/20 border border-accent-green/30 rounded-xl text-sm text-accent-green hover:shadow-lg hover:shadow-accent-green/10 transition-all disabled:opacity-50"
            >
              {customScanning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning {searchInput.trim().toUpperCase()}...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Scan New Stock: {searchInput.trim().toUpperCase()}
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Progress bar when scanning */}
        {isScanning && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Scanning progress</span>
              <span>{totalScanned}/{totalStocks} stocks ({scanProgress.toFixed(0)}%)</span>
            </div>
            <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent-green to-accent-blue rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${scanProgress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Summary Stat Cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">Total Scanned</div>
          <div className="text-2xl font-bold tabular-nums">{totalScanned}</div>
          <div className="text-xs text-gray-500">{totalStocks} in universe</div>
        </div>
        <div className="glass-card p-4 border-accent-green/10">
          <div className="text-xs text-gray-500 mb-1">Buy Signals</div>
          <div className="text-2xl font-bold tabular-nums text-accent-green">{buyCount}</div>
          <div className="text-xs text-accent-green/60">
            {totalScanned > 0 ? ((buyCount / totalScanned) * 100).toFixed(0) : 0}% of scanned
          </div>
        </div>
        <div className="glass-card p-4 border-accent-red/10">
          <div className="text-xs text-gray-500 mb-1">Sell Signals</div>
          <div className="text-2xl font-bold tabular-nums text-accent-red">{sellCount}</div>
          <div className="text-xs text-accent-red/60">
            {totalScanned > 0 ? ((sellCount / totalScanned) * 100).toFixed(0) : 0}% of scanned
          </div>
        </div>
        <div className="glass-card p-4 border-accent-gold/10">
          <div className="text-xs text-gray-500 mb-1">Neutral</div>
          <div className="text-2xl font-bold tabular-nums text-accent-gold">{neutralCount}</div>
          <div className="text-xs text-accent-gold/60">
            {totalScanned > 0 ? ((neutralCount / totalScanned) * 100).toFixed(0) : 0}% of scanned
          </div>
        </div>
        <div className="glass-card p-4 border-accent-red/10">
          <div className="text-xs text-gray-500 mb-1">Volume Spikes 🔥</div>
          <div className="text-2xl font-bold tabular-nums text-accent-red">{volSpikeStocks.length}</div>
          <div className="text-xs text-accent-red/60">unusual activity</div>
        </div>
      </motion.div>

      {/* ── Volume Spike Alert Banner ── */}
      <AnimatePresence>
        {volSpikeStocks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-accent-red/5 border border-accent-red/20 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔥</span>
              <h3 className="font-semibold text-accent-red text-sm">Volume Spike Alert — {volSpikeStocks.length} stock{volSpikeStocks.length > 1 ? 's' : ''} with unusual volume</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {volSpikeStocks.slice(0, 15).map(s => (
                <button
                  key={s.symbol}
                  onClick={() => setSelectedStock(s.symbol)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded-lg text-xs text-accent-red hover:bg-accent-red/20 transition-colors"
                >
                  <span className="font-medium">{s.symbol.replace('.NS', '')}</span>
                  <span className="text-accent-red/70">{s.vol_ratio?.toFixed(1)}x</span>
                </button>
              ))}
              {volSpikeStocks.length > 15 && (
                <span className="text-xs text-accent-red/50 py-1.5">+{volSpikeStocks.length - 15} more</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Table ── */}
      {isLoading ? (
        <SkeletonTable rows={10} cols={10} />
      ) : error ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-accent-red mb-2">Failed to load scanner data</h3>
          <p className="text-sm text-gray-500 mb-4">Please check your connection and try again.</p>
          <button onClick={handleRefresh} className="px-4 py-2 bg-accent-green/20 text-accent-green rounded-lg text-sm hover:bg-accent-green/30 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/5 text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="p-2.5 text-left font-medium w-8">#</th>
                  <th className="p-2.5 text-left font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('symbol')}>
                    Stock {sortIcon('symbol')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('price')}>
                    Price {sortIcon('price')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('change_pct')}>
                    Chg% {sortIcon('change_pct')}
                  </th>
                  <th className="p-2.5 text-center font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('consensus')}>
                    Consensus {sortIcon('consensus')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('confidence')}>
                    Conf% {sortIcon('confidence')}
                  </th>
                  <th className="p-2.5 text-center font-medium">Dir</th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('entry')}>
                    Entry {sortIcon('entry')}
                  </th>
                  <th className="p-2.5 text-right font-medium">Target</th>
                  <th className="p-2.5 text-right font-medium">SL</th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('risk_reward')}>
                    R:R {sortIcon('risk_reward')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('target_prob')}>
                    TgtProb {sortIcon('target_prob')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('sl_prob')}>
                    SLProb {sortIcon('sl_prob')}
                  </th>
                  <th className="p-2.5 text-center font-medium">FVP</th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('premium_disc')}>
                    Prem/Disc {sortIcon('premium_disc')}
                  </th>
                  <th className="p-2.5 text-center font-medium">AMD</th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('momentum')}>
                    Mom {sortIcon('momentum')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('rsi')}>
                    RSI {sortIcon('rsi')}
                  </th>
                  <th className="p-2.5 text-right font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('vol_ratio')}>
                    Vol Ratio {sortIcon('vol_ratio')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {stocks.map((s, i) => {
                  const pd = parsePremDisc(s.premium_disc);
                  const fvpB = fvpBadge(s.fvp_signal);
                  return (
                    <motion.tr
                      key={s.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.3) }}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                      onClick={() => setSelectedStock(s.symbol)}
                    >
                      <td className="p-2.5 text-gray-600 tabular-nums">{i + 1}</td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          {s.custom && <span className="text-accent-gold text-[10px]">★</span>}
                          <div>
                            <div className="font-semibold text-white">{s.symbol?.replace('.NS', '')}</div>
                            <div className="text-[10px] text-gray-500 truncate max-w-[100px]">{s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5 text-right tabular-nums font-medium">₹{formatNumber(s.price)}</td>
                      <td className={`p-2.5 text-right tabular-nums font-medium ${getPnlColor(s.change_pct)}`}>
                        {formatPercent(s.change_pct)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${consensusBg(s.consensus)}`}>
                          {s.consensus}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`tabular-nums font-medium ${confidenceColor(s.confidence)}`}>
                          {s.confidence?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`text-[10px] font-bold ${
                          s.trade_dir?.toUpperCase() === 'LONG' ? 'text-accent-green' : 'text-accent-red'
                        }`}>
                          {s.trade_dir?.toUpperCase() === 'LONG' ? '▲' : '▼'}{s.trade_dir}
                        </span>
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-accent-blue">₹{formatNumber(s.entry)}</td>
                      <td className="p-2.5 text-right">
                        <div className="tabular-nums text-accent-green">₹{formatNumber(s.target_1)}</div>
                        {s.target_2 != null && s.target_2 > 0 && (
                          <div className="tabular-nums text-accent-green/60 text-[10px]">₹{formatNumber(s.target_2)}</div>
                        )}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-accent-red">₹{formatNumber(s.stop_loss)}</td>
                      <td className={`p-2.5 text-right tabular-nums ${rrColor(s.risk_reward)}`}>
                        {s.risk_reward?.toFixed(1)}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        <span className={s.target_prob >= 50 ? 'text-accent-green' : 'text-gray-400'}>
                          {s.target_prob?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        <span className={s.sl_prob >= 50 ? 'text-accent-red' : 'text-gray-400'}>
                          {s.sl_prob?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${fvpB.cls}`}>
                          {fvpB.text}
                        </span>
                      </td>
                      <td className={`p-2.5 text-right tabular-nums text-[11px] ${pd.num < 0 ? 'text-accent-green' : pd.num > 0 ? 'text-accent-red' : 'text-gray-400'}`}>
                        {pd.label}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[10px] text-accent-purple">{s.amd_regime}</span>
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-10 h-1.5 bg-dark-500 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                s.momentum >= 60 ? 'bg-accent-green' :
                                s.momentum >= 40 ? 'bg-accent-gold' : 'bg-accent-red'
                              }`}
                              style={{ width: `${Math.min(Math.max(s.momentum, 0), 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-[11px]">{s.momentum?.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={`p-2.5 text-right tabular-nums font-medium ${rsiColor(s.rsi)}`}>
                        {s.rsi?.toFixed(1)}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`tabular-nums ${s.vol_spike ? 'text-accent-red font-bold' : s.vol_ratio > 1.5 ? 'text-accent-gold' : 'text-gray-500'}`}>
                          {s.vol_ratio?.toFixed(1)}x
                          {s.vol_spike && ' 🔥'}
                        </span>
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

          {stocks.length > 0 && (
            <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {stocks.length} of {data?.stocks?.length ?? 0} stocks</span>
              <span>Click any row for full analysis</span>
            </div>
          )}
        </div>
      )}

      {/* ── Stock Detail Modal ── */}
      <AnimatePresence>
        {selectedStock && (
          <StockDetailModal
            symbol={selectedStock}
            onClose={() => setSelectedStock(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
