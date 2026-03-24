'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine, LineChart, Line, ComposedChart,
} from 'recharts';

/* ─── Constants ─── */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://pranavbharadwaj.pythonanywhere.com';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

/* ─── Types ─── */

interface Position {
  trade_id: number; symbol: string; instrument_key?: string;
  transaction_type: string; quantity: number; entry_price: number;
  target_price: number; stop_loss: number; signal: string;
  confidence: number; strategy?: string; highest_price?: number;
  current_price?: number;
}

interface ClosedTrade {
  id: number; timestamp: string; symbol: string; entry_price: number;
  exit_price: number; pnl: number; pnl_pct: number; exit_reason: string;
  exit_time: string; is_paper: number; quantity: number;
  signal: string; confidence: number;
}

interface LogEntry { time: string; type: string; msg: string; }

interface BotConfig {
  max_daily_loss: number; max_position_size: number;
  max_open_positions: number; max_capital_deployed: number;
  min_confidence: number; trading_hours: string;
  consecutive_loss_limit: number; trailing_sl_pct: number;
  scan_interval: number; auto_exit_eod: boolean; paper_mode: boolean;
}

interface SafetyInfo {
  paused_until: string | null;
  daily_loss_limit_remaining: number;
  positions_remaining: number;
}

interface BotStatus {
  running: boolean; mode: string; paper_mode: boolean; authenticated: boolean;
  open_positions: Position[]; daily_pnl: number; total_pnl: number;
  today_pnl: number; wins: number; losses: number; win_rate: number;
  consecutive_losses: number; today_trades: number;
  closed_trades: ClosedTrade[]; log: LogEntry[];
  config: BotConfig; safety: SafetyInfo;
  open_count: number; capital_deployed: number;
  is_trading_hours: boolean; kill_switch: boolean;
  paused_until: number; recent_log: LogEntry[];
}

interface UpstoxStatus {
  authenticated: boolean; mode: string;
  profile?: Record<string, unknown>;
  funds?: Record<string, unknown>;
}

/* ─── Helpers ─── */

function formatINR(v: number): string {
  if (v == null || isNaN(v)) return '₹0.00';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(v: number) {
  return v > 0 ? 'text-accent-green' : v < 0 ? 'text-accent-red' : 'text-gray-400';
}

function pnlBg(v: number) {
  return v > 0 ? 'bg-accent-green/10 border-accent-green/30' : v < 0 ? 'bg-accent-red/10 border-accent-red/30' : 'bg-gray-700/30 border-white/5';
}

function confidenceColor(c: number) {
  if (c >= 80) return 'text-accent-green';
  if (c >= 60) return 'text-accent-gold';
  return 'text-accent-red';
}

function exitBadge(reason: string) {
  if (!reason) return 'bg-gray-700/30 text-gray-400';
  const r = reason.toUpperCase();
  if (r.includes('TARGET')) return 'bg-accent-green/10 text-accent-green';
  if (r.includes('STOP_LOSS')) return 'bg-accent-red/10 text-accent-red';
  if (r.includes('TRAILING')) return 'bg-accent-orange/10 text-accent-orange';
  if (r.includes('EOD')) return 'bg-accent-gold/10 text-accent-gold';
  if (r.includes('MANUAL')) return 'bg-gray-700/30 text-gray-400';
  return 'bg-gray-700/30 text-gray-400';
}

function logBadge(type: string) {
  switch (type?.toUpperCase()) {
    case 'OPEN': return 'bg-accent-blue/10 text-accent-blue';
    case 'CLOSE': return 'bg-accent-green/10 text-accent-green';
    case 'EXIT': return 'bg-accent-red/10 text-accent-red';
    case 'SCAN': return 'bg-gray-700/30 text-gray-400';
    case 'ERROR': return 'bg-accent-red/15 text-accent-red';
    case 'SAFETY': return 'bg-accent-orange/10 text-accent-orange';
    case 'BOT': return 'bg-accent-purple/10 text-accent-purple';
    default: return 'bg-gray-700/30 text-gray-400';
  }
}

const fadeIn = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };
const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const cardItem = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

/* ─── Sub-components ─── */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={cardItem} className={`bg-dark-700/60 backdrop-blur border border-white/5 rounded-xl p-3 sm:p-5 ${className}`}>
      {children}
    </motion.div>
  );
}

function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="glass-card p-6 max-w-md w-full mx-4 border border-white/10" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">{title}</h3>
            <p className="text-sm text-gray-400 mb-5 whitespace-pre-line">{message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-dark-700 hover:bg-dark-600 border border-white/5 transition-all">Cancel</button>
              <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${danger ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/20' : 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border border-accent-green/20'}`}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LiveModeConfirmModal({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="glass-card p-6 max-w-md w-full mx-4 border-2 border-accent-red/50" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <span className="text-4xl">⚠️</span>
              <h3 className="text-xl font-bold text-accent-red mt-2">SWITCH TO LIVE MODE</h3>
            </div>
            <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 mb-4 text-sm text-accent-red space-y-1">
              <p>⚠️ This will execute <strong>REAL trades</strong> with <strong>REAL money</strong>.</p>
              <p>⚠️ Orders will be placed on your Upstox account.</p>
              <p>⚠️ Financial losses are possible and irreversible.</p>
            </div>
            <p className="text-sm text-gray-400 mb-2">Type <strong className="text-white">&quot;I UNDERSTAND&quot;</strong> to confirm:</p>
            <input value={typed} onChange={e => setTyped(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-white/10 text-white text-sm mb-4 focus:outline-none focus:border-accent-red/50"
              placeholder="Type here..." />
            <div className="flex gap-3 justify-end">
              <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-dark-700 hover:bg-dark-600 border border-white/5 transition-all">Cancel</button>
              <button onClick={onConfirm} disabled={typed !== 'I UNDERSTAND'}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                🔴 Enable LIVE Mode
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════ MAIN PAGE ═══════════════════════════════════════════ */

export default function RealTradingPage() {
  /* ─── PIN authentication state ─── */
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinShake, setPinShake] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);

  /* ─── SSE state ─── */
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>('--');

  /* ─── SWR data (non-bot-status) ─── */
  const { data: upstoxStatus, error: upstoxErr } = useSWR<UpstoxStatus>(
    isAuthenticated ? `${API_BASE}/api/upstox/status` : null, fetcher, { refreshInterval: 30000 }
  );
  const { data: livePositions } = useSWR(
    isAuthenticated && upstoxStatus?.authenticated ? `${API_BASE}/api/upstox/positions` : null, fetcher, { refreshInterval: 10000 }
  );
  const { data: liveOrders } = useSWR(
    isAuthenticated && upstoxStatus?.authenticated ? `${API_BASE}/api/upstox/orders` : null, fetcher, { refreshInterval: 10000 }
  );
  const { data: tradeHistory } = useSWR(
    isAuthenticated ? `${API_BASE}/api/upstox/history` : null, fetcher, { refreshInterval: 30000 }
  );

  /* ─── Local state ─── */
  const [setupOpen, setSetupOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(`${API_BASE}/api/upstox/callback`);
  const [authCode, setAuthCode] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [liveModeModal, setLiveModeModal] = useState(false);
  const [closeAllModal, setCloseAllModal] = useState(false);
  const [closeTradeId, setCloseTradeId] = useState<number | null>(null);
  const [editingSafety, setEditingSafety] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [liveDataTab, setLiveDataTab] = useState<'positions' | 'orders' | 'funds'>('positions');
  const logRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const isLive = (botStatus && botStatus.paper_mode === false) || upstoxStatus?.mode === 'live';
  const isAuth = botStatus?.authenticated || upstoxStatus?.authenticated || false;
  const isRunning = botStatus?.running || false;
  const modeAccent = isLive ? 'accent-red' : 'accent-gold';

  /* ─── PIN check on mount ─── */
  useEffect(() => {
    fetch(`${API_BASE}/api/upstox/status`)
      .then(r => r.json())
      .then(d => {
        setPinRequired(d.pin_required !== false);
        if (!d.pin_required) {
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        // If API unreachable, skip PIN (allow access)
        setIsAuthenticated(true);
      })
      .finally(() => setPinLoading(false));
  }, []);

  /* ─── SSE connection for bot status ─── */
  useEffect(() => {
    if (!isAuthenticated) return;

    const eventSource = new EventSource(`${API_BASE}/api/upstox/stream`);

    eventSource.onopen = () => setSseConnected(true);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setBotStatus(data);
        setLastUpdateTime(Date.now());
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      setSseConnected(false);
    };

    return () => eventSource.close();
  }, [isAuthenticated]);

  /* ─── Timer for "last update" display ─── */
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdateTime) {
        const diff = Math.round((Date.now() - lastUpdateTime) / 1000);
        setTimeSinceUpdate(diff < 60 ? `${diff}s ago` : `${Math.floor(diff / 60)}m ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdateTime]);

  /* ─── Auto-open setup if not auth ─── */
  useEffect(() => {
    if (upstoxStatus && !upstoxStatus.authenticated && !botStatus?.authenticated) {
      setSetupOpen(true);
    }
  }, [upstoxStatus, botStatus]);

  /* ─── Auto-scroll log ─── */
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [botStatus?.log]);

  /* ─── Toast helper ─── */
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ─── Auth fetch helper ─── */
  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        'X-Upstox-Pin': pin,
      },
    });
  }, [pin]);

  /* ─── PIN handlers ─── */
  async function handlePinSubmit() {
    setPinError('');
    try {
      const res = await fetch(`${API_BASE}/api/upstox/verify_pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 401 || !res.ok) {
        setPinError('Wrong PIN');
        setPinShake(true);
        setTimeout(() => setPinShake(false), 600);
        return;
      }
      setIsAuthenticated(true);
    } catch {
      setPinError('Connection error');
    }
  }

  async function handleSetPin() {
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('PIN must be 4-6 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    setPinError('');
    try {
      const res = await fetch(`${API_BASE}/api/upstox/set_pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      if (!res.ok) {
        setPinError('Failed to set PIN');
        return;
      }
      setPin(newPin);
      setIsAuthenticated(true);
    } catch {
      setPinError('Connection error');
    }
  }

  /* ─── API actions ─── */
  async function postAction(url: string, body?: Record<string, unknown>, label = '') {
    setActionLoading(label || url);
    try {
      const res = await authFetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') throw new Error(data.error || data.message || 'Request failed');
      showToast(data.message || data.status || 'Success');
      mutate(`${API_BASE}/api/upstox/status`);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      showToast(msg, 'error');
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveConfig() {
    await postAction('/api/upstox/config', { api_key: apiKey, api_secret: apiSecret, redirect_uri: redirectUri }, 'save-config');
  }

  async function handleLogin() {
    setActionLoading('login');
    try {
      const res = await fetch(`${API_BASE}/api/upstox/auth_url`);
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else showToast('No auth URL returned. Save config first.', 'error');
    } catch { showToast('Failed to get auth URL', 'error'); }
    finally { setActionLoading(null); }
  }

  async function handleExchangeToken() {
    await postAction('/api/upstox/callback', { code: authCode }, 'exchange');
  }

  async function handleStartStop() {
    if (isRunning) {
      setBotStatus((prev: BotStatus | null) => prev ? { ...prev, running: false } : prev);
      await postAction('/api/upstox/bot/stop', undefined, 'stop');
    } else {
      setBotStatus((prev: BotStatus | null) => prev ? { ...prev, running: true } : prev);
      await postAction('/api/upstox/bot/start', undefined, 'start');
    }
  }

  async function handleCloseAll() {
    setCloseAllModal(false);
    await postAction('/api/upstox/bot/close_all', undefined, 'close-all');
  }

  async function handleCloseTrade(tradeId: number) {
    setCloseTradeId(null);
    await postAction(`/api/upstox/bot/close?trade_id=${tradeId}`, undefined, `close-${tradeId}`);
  }

  async function handleModeSwitch(newMode: string) {
    if (newMode === 'live') { setLiveModeModal(true); return; }
    setBotStatus((prev: BotStatus | null) => prev ? { ...prev, paper_mode: true } : prev);
    await postAction('/api/upstox/bot/mode', { mode: newMode }, 'mode');
  }

  async function confirmLiveMode() {
    setLiveModeModal(false);
    setBotStatus((prev: BotStatus | null) => prev ? { ...prev, paper_mode: false } : prev);
    await postAction('/api/upstox/bot/mode', { mode: 'live' }, 'mode');
  }

  async function handleSafetySave(key: string, value: string) {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) { showToast('Invalid value', 'error'); return; }
    await postAction('/api/upstox/config', { [key]: numVal }, 'safety');
    setEditingSafety(null);
  }

  function refreshAll() {
    mutate(`${API_BASE}/api/upstox/status`);
    mutate(`${API_BASE}/api/upstox/positions`);
    mutate(`${API_BASE}/api/upstox/orders`);
    mutate(`${API_BASE}/api/upstox/history`);
    showToast('Refreshed');
  }

  /* ─── Chart data ─── */
  const chartData = (() => {
    const trades = botStatus?.closed_trades || [];
    const grouped: Record<string, number> = {};
    trades.forEach(t => {
      const d = (t.exit_time || t.timestamp || '').split('T')[0];
      if (d) grouped[d] = (grouped[d] || 0) + (t.pnl || 0);
    });
    let cumulative = 0;
    return Object.entries(grouped).sort().map(([date, pnl]) => {
      cumulative += pnl;
      return { date: date.slice(5), pnl, cumulative };
    });
  })();

  /* ─── Positions derived ─── */
  const positions = botStatus?.open_positions || [];
  const closedTrades = botStatus?.closed_trades || [];
  const logs = botStatus?.log || [];
  const config = botStatus?.config;
  const safety = botStatus?.safety;

  const totalUnrealisedPnl = positions.reduce((sum, p) => {
    const cur = p.current_price || p.highest_price || p.entry_price;
    const pnl = p.transaction_type === 'BUY'
      ? (cur - p.entry_price) * p.quantity
      : (p.entry_price - cur) * p.quantity;
    return sum + pnl;
  }, 0);

  const totalRealisedPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);

  /* ─── Safety cards config ─── */
  const safetyCards = config ? [
    { key: 'max_daily_loss', label: 'Max Daily Loss', icon: '🛑', value: config.max_daily_loss, display: formatINR(config.max_daily_loss),
      sub: `Remaining: ${formatINR(safety?.daily_loss_limit_remaining ?? config.max_daily_loss)}`, bar: safety ? 1 - (safety.daily_loss_limit_remaining / config.max_daily_loss) : 0 },
    { key: 'max_position_size', label: 'Max Position Size', icon: '📊', value: config.max_position_size, display: formatINR(config.max_position_size), sub: 'Per trade limit' },
    { key: 'max_open_positions', label: 'Max Open Positions', icon: '📝', value: config.max_open_positions, display: `${config.max_open_positions}`,
      sub: `Used: ${positions.length} / ${config.max_open_positions}`, bar: positions.length / config.max_open_positions },
    { key: 'max_capital_deployed', label: 'Max Capital', icon: '💰', value: config.max_capital_deployed, display: formatINR(config.max_capital_deployed), sub: 'Total capital limit' },
    { key: 'min_confidence', label: 'Min Confidence', icon: '🎯', value: config.min_confidence, display: `${config.min_confidence}%`, sub: 'Signal threshold' },
    { key: 'trading_hours', label: 'Trading Hours', icon: '🕐', value: config.trading_hours, display: config.trading_hours, sub: 'IST timezone', noEdit: true },
    { key: 'consecutive_loss_limit', label: 'Loss Streak Limit', icon: '🔒', value: config.consecutive_loss_limit, display: `${config.consecutive_loss_limit}`,
      sub: `Current: ${botStatus?.consecutive_losses ?? 0}`, bar: (botStatus?.consecutive_losses ?? 0) / config.consecutive_loss_limit },
    { key: 'circuit_breaker', label: 'Circuit Breaker', icon: '⚡', value: 0, display: safety?.paused_until ? '⏸ Paused' : '✅ Active',
      sub: safety?.paused_until ? `Until: ${safety.paused_until}` : 'No cooldown active', noEdit: true },
  ] : [];

  /* ═════════════ RENDER ═════════════ */

  /* ─── PIN loading screen ─── */
  if (pinLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-900">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⚡</div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </motion.div>
      </div>
    );
  }

  /* ─── PIN login / setup screen ─── */
  if (!isAuthenticated) {
    // PIN required → show login
    if (pinRequired && !isSettingPin) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-900/95 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mx-4"
          >
            <motion.div
              animate={pinShake ? { x: [-12, 12, -12, 12, -6, 6, 0] } : {}}
              transition={{ duration: 0.5 }}
              className="bg-dark-700/80 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl"
            >
              <div className="text-center mb-6">
                <span className="text-5xl">🔒</span>
                <h2 className="text-xl font-bold text-white mt-3">Real Trading Access</h2>
                <p className="text-sm text-gray-400 mt-1">Enter your PIN to continue</p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                onKeyDown={e => e.key === 'Enter' && pin.length >= 4 && handlePinSubmit()}
                placeholder="● ● ● ●"
                className="w-full px-4 py-4 rounded-xl bg-dark-900 border border-white/10 text-white text-2xl text-center tracking-[0.5em] font-mono focus:outline-none focus:border-accent-blue/50 placeholder:text-gray-600 placeholder:tracking-[0.3em]"
                autoFocus
              />
              {pinError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-accent-red text-sm text-center mt-3">
                  ❌ {pinError}
                </motion.p>
              )}
              <button
                onClick={handlePinSubmit}
                disabled={pin.length < 4}
                className="w-full mt-4 px-4 py-3 rounded-xl text-sm font-bold bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 border border-accent-blue/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                🔓 Unlock
              </button>
              <button
                onClick={() => { setIsSettingPin(true); setPinError(''); }}
                className="w-full mt-2 px-4 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-all"
              >
                Set a new PIN instead
              </button>
            </motion.div>
          </motion.div>
        </div>
      );
    }

    // No PIN set or setting new PIN → show setup
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-900/95 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm mx-4"
        >
          <div className="bg-dark-700/80 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <span className="text-5xl">🔐</span>
              <h2 className="text-xl font-bold text-white mt-3">Set Access PIN</h2>
              <p className="text-sm text-gray-400 mt-1">Set a PIN to protect your trading dashboard</p>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                placeholder="New PIN (4-6 digits)"
                className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-white/10 text-white text-lg text-center tracking-[0.3em] font-mono focus:outline-none focus:border-accent-blue/50 placeholder:text-gray-600 placeholder:text-sm placeholder:tracking-normal"
                autoFocus
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                onKeyDown={e => e.key === 'Enter' && newPin.length >= 4 && confirmPin.length >= 4 && handleSetPin()}
                placeholder="Confirm PIN"
                className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-white/10 text-white text-lg text-center tracking-[0.3em] font-mono focus:outline-none focus:border-accent-blue/50 placeholder:text-gray-600 placeholder:text-sm placeholder:tracking-normal"
              />
            </div>
            {pinError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-accent-red text-sm text-center mt-3">
                ❌ {pinError}
              </motion.p>
            )}
            <button
              onClick={handleSetPin}
              disabled={newPin.length < 4 || confirmPin.length < 4}
              className="w-full mt-4 px-4 py-3 rounded-xl text-sm font-bold bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border border-accent-green/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              🔒 Set PIN
            </button>
            {pinRequired && (
              <button
                onClick={() => { setIsSettingPin(false); setPinError(''); }}
                className="w-full mt-2 px-4 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-all"
              >
                Back to login
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

      {/* ─── Toast ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
            className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === 'error' ? 'bg-accent-red/20 border-accent-red/30 text-accent-red' : 'bg-accent-green/20 border-accent-green/30 text-accent-green'}`}>
            {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Modals ─── */}
      <LiveModeConfirmModal open={liveModeModal} onConfirm={confirmLiveMode} onCancel={() => setLiveModeModal(false)} />
      <ConfirmModal open={closeAllModal} title="🛑 Close All Positions" message="This will close ALL open positions immediately. Are you sure?" onConfirm={handleCloseAll} onCancel={() => setCloseAllModal(false)} confirmLabel="Close All" danger />
      <ConfirmModal open={closeTradeId !== null} title="Close Position" message={`Close trade #${closeTradeId}?`} onConfirm={() => closeTradeId !== null && handleCloseTrade(closeTradeId)} onCancel={() => setCloseTradeId(null)} confirmLabel="Close" danger />

      {/* ════════════ 1. HEADER BAR ════════════ */}
      <motion.div {...fadeIn} className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold flex items-center gap-2 flex-wrap">
              <span className="whitespace-nowrap">⚡ Upstox Trading</span>
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border ${
                isLive
                  ? 'bg-accent-red/20 text-accent-red border-accent-red/40 animate-pulse'
                  : 'bg-accent-gold/20 text-accent-gold border-accent-gold/40'
              }`}>
                {isLive ? '🔴 LIVE' : '📝 PAPER'}
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-[10px] sm:text-xs">
              <span className={`flex items-center gap-1 ${sseConnected ? 'text-accent-green' : 'text-accent-red'}`}>
                <span className={`inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${sseConnected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
                {sseConnected ? 'Live' : 'Offline'}
              </span>
              <span className="text-gray-600">|</span>
              <span className={`flex items-center gap-1 ${isAuth ? 'text-accent-green' : 'text-accent-red'}`}>
                {isAuth ? '✓ Upstox' : '✕ Upstox'}
              </span>
              <span className="text-gray-600 hidden sm:inline">|</span>
              <span className="text-gray-400 hidden sm:inline">📡 {timeSinceUpdate}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium border ${
            isAuth ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'bg-accent-red/10 border-accent-red/30 text-accent-red'
          }`}>
            <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isAuth ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
            <span className="hidden sm:inline">{isAuth ? '🟢 Connected' : '🔴 Not Connected'}</span>
            <span className="sm:hidden">{isAuth ? 'OK' : 'Off'}</span>
          </div>

          <button onClick={handleLogin} disabled={actionLoading === 'login'}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 border border-accent-blue/30 transition-all disabled:opacity-50">
            <span className="hidden sm:inline">{actionLoading === 'login' ? '...' : '🔗 Login to Upstox'}</span>
            <span className="sm:hidden">{actionLoading === 'login' ? '...' : '🔗 Login'}</span>
          </button>

          <button onClick={handleStartStop}
            disabled={actionLoading === 'start' || actionLoading === 'stop'}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-all disabled:opacity-50 ${
              isRunning
                ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border-accent-red/30'
                : 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border-accent-green/30'
            }`}>
            {isRunning ? '🛑 Stop' : '▶️ Start'}
          </button>

          <button onClick={() => setCloseAllModal(true)} disabled={positions.length === 0}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-accent-red/10 text-accent-red hover:bg-accent-red/20 border border-accent-red/20 transition-all disabled:opacity-30">
            <span className="hidden sm:inline">🛑 Close All</span>
            <span className="sm:hidden">✕ All</span>
          </button>

          <button onClick={refreshAll}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20 border border-accent-gold/20 transition-all">
            🔄
          </button>
        </div>
      </motion.div>

      {/* ════════════ 2. SETUP PANEL ════════════ */}
      <motion.div {...fadeIn}>
        <button onClick={() => setSetupOpen(!setupOpen)}
          className="w-full text-left glass-card-hover p-4 flex items-center justify-between">
          <span className="font-semibold flex items-center gap-2">
            🔧 Setup &amp; Authentication
            {isAuth && <span className="text-xs text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">✓ Connected</span>}
          </span>
          <span className="text-gray-400 text-lg">{setupOpen ? '▲' : '▼'}</span>
        </button>
        <AnimatePresence>
          {setupOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="glass-card p-5 mt-1 space-y-4 border-t-0 rounded-t-none">
                {/* Config inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">API Key</label>
                    <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your Upstox API Key"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-white/10 text-sm text-white focus:outline-none focus:border-accent-blue/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">API Secret</label>
                    <input value={apiSecret} onChange={e => setApiSecret(e.target.value)} type="password" placeholder="Your Upstox API Secret"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-white/10 text-sm text-white focus:outline-none focus:border-accent-blue/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Redirect URI</label>
                    <input value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="Redirect URI"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-white/10 text-sm text-white focus:outline-none focus:border-accent-blue/50" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleSaveConfig} disabled={actionLoading === 'save-config' || !apiKey}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 border border-accent-blue/30 transition-all disabled:opacity-50">
                    {actionLoading === 'save-config' ? '...' : '💾 Save & Connect'}
                  </button>
                  <button onClick={handleLogin} disabled={actionLoading === 'login'}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border border-accent-green/30 transition-all disabled:opacity-50">
                    🔗 Login with Upstox
                  </button>
                </div>

                {/* Token exchange */}
                <div className="border-t border-white/5 pt-4">
                  <p className="text-xs text-gray-400 mb-2">After login, paste the authorization code from the redirect URL:</p>
                  <div className="flex gap-2">
                    <input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="Paste authorization code here"
                      className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-white/10 text-sm text-white focus:outline-none focus:border-accent-green/50" />
                    <button onClick={handleExchangeToken} disabled={!authCode || actionLoading === 'exchange'}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border border-accent-green/30 transition-all disabled:opacity-50">
                      {actionLoading === 'exchange' ? '...' : '🔑 Exchange Token'}
                    </button>
                  </div>
                </div>

                {/* Profile / Funds */}
                {isAuth && upstoxStatus?.profile && (
                  <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-accent-green mb-2">👤 Profile</h4>
                      <div className="text-xs text-gray-400 space-y-1">
                        {Object.entries(upstoxStatus.profile).map(([k, v]) => (
                          <div key={k}><span className="text-gray-500">{k}:</span> <span className="text-white">{String(v)}</span></div>
                        ))}
                      </div>
                    </div>
                    {upstoxStatus.funds && (
                      <div>
                        <h4 className="text-sm font-semibold text-accent-gold mb-2">💰 Funds</h4>
                        <div className="text-xs text-gray-400 space-y-1">
                          {Object.entries(upstoxStatus.funds).map(([k, v]) => (
                            <div key={k}><span className="text-gray-500">{k}:</span> <span className="text-white">{String(v)}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ════════════ 3. MODE TOGGLE ════════════ */}
      <motion.div {...fadeIn} className={`glass-card p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 border-2 ${isLive ? 'border-accent-red/30' : 'border-accent-gold/30'}`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-sm sm:text-lg font-bold">Mode:</span>
          <span className={`text-lg sm:text-2xl font-black ${isLive ? 'text-accent-red' : 'text-accent-gold'}`}>
            {isLive ? '🔴 LIVE' : '📝 PAPER'}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 bg-dark-900 rounded-xl p-1">
          <button onClick={() => handleModeSwitch('paper')}
            className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${!isLive ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/30' : 'text-gray-500 hover:text-gray-300'}`}>
            📝 Paper
          </button>
          <button onClick={() => handleModeSwitch('live')}
            className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${isLive ? 'bg-accent-red/20 text-accent-red border border-accent-red/30 animate-pulse' : 'text-gray-500 hover:text-gray-300'}`}>
            🔴 Live
          </button>
        </div>
      </motion.div>

      {/* ════════════ 4. SAFETY DASHBOARD ════════════ */}
      {config && (
        <motion.div variants={stagger} initial="initial" animate="animate">
          <h2 className="text-sm sm:text-lg font-bold mb-3 flex items-center gap-2">🔒 Safety Dashboard</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {safetyCards.map(card => (
              <GlassCard key={card.key} className="relative group">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-base sm:text-lg">{card.icon}</span>
                  {!card.noEdit && editingSafety !== card.key && (
                    <button onClick={() => { setEditingSafety(card.key); setEditValue(String(card.value)); }}
                      className="text-xs text-gray-500 hover:text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1 truncate">{card.label}</p>
                {editingSafety === card.key ? (
                  <div className="flex gap-1 mt-1">
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                      className="flex-1 px-2 py-1 rounded bg-dark-900 border border-white/10 text-sm text-white w-full focus:outline-none" />
                    <button onClick={() => handleSafetySave(card.key, editValue)} className="text-accent-green text-xs px-2">✓</button>
                    <button onClick={() => setEditingSafety(null)} className="text-accent-red text-xs px-1">✕</button>
                  </div>
                ) : (
                  <p className="text-base sm:text-xl font-bold text-white truncate">{card.display}</p>
                )}
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">{card.sub}</p>
                {card.bar !== undefined && (
                  <div className="mt-2 h-1.5 rounded-full bg-dark-900 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${card.bar > 0.8 ? 'bg-accent-red' : card.bar > 0.5 ? 'bg-accent-gold' : 'bg-accent-green'}`}
                      style={{ width: `${Math.min(card.bar * 100, 100)}%` }} />
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </motion.div>
      )}

      {/* ════════════ 5. PORTFOLIO SUMMARY ════════════ */}
      <motion.div variants={stagger} initial="initial" animate="animate">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Total P&L', value: botStatus?.total_pnl ?? 0, icon: '💰' },
            { label: "Today's P&L", value: botStatus?.today_pnl ?? 0, icon: '📊' },
            { label: 'Win Rate', value: botStatus?.win_rate ?? 0, icon: '🎯', isPercent: true, sub: `${botStatus?.wins ?? 0}W / ${botStatus?.losses ?? 0}L` },
            { label: "Today's Trades", value: botStatus?.today_trades ?? 0, icon: '📝', isCount: true },
          ].map(card => (
            <GlassCard key={card.label} className={`border ${card.isPercent || card.isCount ? 'border-white/5' : pnlBg(card.value)}`}>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-base sm:text-lg">{card.icon}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400">{card.label}</p>
              <p className={`text-lg sm:text-2xl font-bold ${card.isPercent ? (card.value >= 50 ? 'text-accent-green' : 'text-accent-red') : card.isCount ? 'text-white' : pnlColor(card.value)}`}>
                {card.isPercent ? `${card.value.toFixed(1)}%` : card.isCount ? card.value : formatINR(card.value)}
              </p>
              {card.sub && <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{card.sub}</p>}
            </GlassCard>
          ))}
        </div>
      </motion.div>

      {/* ════════════ 6. OPEN POSITIONS TABLE ════════════ */}
      <motion.div {...fadeIn}>
        <div className="glass-card overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">📝 Open Positions <span className="text-xs bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full">{positions.length}</span></h2>
          </div>
          {positions.length === 0 ? (
            <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">No open positions</div>
          ) : (
            <div className="overflow-x-auto -mx-0">
              <table className="w-full text-xs sm:text-sm min-w-[600px]">
                <thead>
                  <tr className="text-[10px] sm:text-xs text-gray-500 border-b border-white/5">
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left font-medium">#</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Symbol</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Signal</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden sm:table-cell">Conf.</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Entry</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden sm:table-cell">Target</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">SL</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden sm:table-cell">Qty</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">P&L</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">%</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden md:table-cell">High</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {positions.map((p, i) => {
                    const cur = p.current_price || p.highest_price || p.entry_price;
                    const pnl = p.transaction_type === 'BUY' ? (cur - p.entry_price) * p.quantity : (p.entry_price - cur) * p.quantity;
                    const pnlPct = p.entry_price > 0 ? ((cur - p.entry_price) / p.entry_price) * 100 : 0;
                    return (
                      <tr key={p.trade_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-500">{i + 1}</td>
                        <td className="px-2 sm:px-3 py-2 font-semibold text-white text-xs sm:text-sm">{p.symbol}</td>
                        <td className="px-2 sm:px-3 py-2">
                          <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${p.signal?.includes('BUY') ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
                            {p.signal}
                          </span>
                        </td>
                        <td className={`px-2 sm:px-3 py-2 font-medium hidden sm:table-cell ${confidenceColor(p.confidence)}`}>{p.confidence}%</td>
                        <td className="px-2 sm:px-3 py-2 text-xs">{formatINR(p.entry_price)}</td>
                        <td className="px-2 sm:px-3 py-2 text-accent-green text-xs hidden sm:table-cell">{formatINR(p.target_price)}</td>
                        <td className={`px-2 sm:px-3 py-2 text-xs font-medium ${
                          p.highest_price && p.highest_price > p.entry_price && p.stop_loss > (p.entry_price * 0.98)
                            ? 'text-accent-orange' : 'text-accent-red'
                        }`}>
                          {formatINR(p.stop_loss)}
                          {p.highest_price && p.highest_price > p.entry_price && p.stop_loss > (p.entry_price * 0.98) && (
                            <span className="ml-1 text-accent-orange" title="Trailing SL active">↑</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">{p.quantity}</td>
                        <td className={`px-2 sm:px-3 py-2 font-semibold ${pnlColor(pnl)}`}>{formatINR(pnl)}</td>
                        <td className={`px-2 sm:px-3 py-2 ${pnlColor(pnlPct)}`}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</td>
                        <td className="px-2 sm:px-3 py-2 text-gray-400 hidden md:table-cell">{formatINR(p.highest_price || 0)}</td>
                        <td className="px-2 sm:px-3 py-2">
                          <button onClick={() => setCloseTradeId(p.trade_id)}
                            disabled={actionLoading === `close-${p.trade_id}`}
                            className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 rounded bg-accent-red/10 text-accent-red hover:bg-accent-red/20 border border-accent-red/20 transition-all disabled:opacity-50">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-dark-800/50">
                    <td colSpan={8} className="px-2 sm:px-3 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-gray-400">Unrealised:</td>
                    <td colSpan={4} className={`px-2 sm:px-3 py-2 text-base sm:text-lg font-bold ${pnlColor(totalUnrealisedPnl)}`}>{formatINR(totalUnrealisedPnl)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* ════════════ 7. CLOSED TRADES TABLE ════════════ */}
      <motion.div {...fadeIn}>
        <div className="glass-card overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-white/5">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">📋 Closed Trades <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full">{closedTrades.length}</span></h2>
          </div>
          {closedTrades.length === 0 ? (
            <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">No closed trades yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm min-w-[550px]">
                <thead>
                  <tr className="text-[10px] sm:text-xs text-gray-500 border-b border-white/5">
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">#</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden sm:table-cell">Time</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Symbol</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden sm:table-cell">Signal</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Entry</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Exit</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">P&L</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">%</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium hidden md:table-cell">Qty</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Exit</th>
                    <th className="px-2 sm:px-3 py-2 text-left font-medium">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {closedTrades.map((t, i) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-2 sm:px-3 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-2 sm:px-3 py-2 text-gray-400 text-[10px] sm:text-xs hidden sm:table-cell">{(t.exit_time || t.timestamp || '').replace('T', ' ').slice(0, 16)}</td>
                      <td className="px-2 sm:px-3 py-2 font-semibold text-white text-xs">{t.symbol}</td>
                      <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.signal?.includes('BUY') ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
                          {t.signal}
                        </span>
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-xs">{formatINR(t.entry_price)}</td>
                      <td className="px-2 sm:px-3 py-2 text-xs">{formatINR(t.exit_price)}</td>
                      <td className={`px-2 sm:px-3 py-2 font-semibold ${pnlColor(t.pnl)}`}>{formatINR(t.pnl)}</td>
                      <td className={`px-2 sm:px-3 py-2 ${pnlColor(t.pnl_pct)}`}>{t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(1)}%</td>
                      <td className="px-2 sm:px-3 py-2 hidden md:table-cell">{t.quantity}</td>
                      <td className="px-2 sm:px-3 py-2">
                        <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full ${exitBadge(t.exit_reason)}`}>{t.exit_reason}</span>
                      </td>
                      <td className="px-2 sm:px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.is_paper ? 'bg-accent-gold/10 text-accent-gold' : 'bg-accent-red/10 text-accent-red'}`}>
                          {t.is_paper ? '📝' : '🔴'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-dark-800/50">
                    <td colSpan={6} className="px-2 sm:px-3 py-2 text-right text-xs sm:text-sm font-semibold text-gray-400">
                      Realised: ({botStatus?.wins ?? 0}W / {botStatus?.losses ?? 0}L)
                    </td>
                    <td colSpan={5} className={`px-2 sm:px-3 py-2 text-base sm:text-lg font-bold ${pnlColor(totalRealisedPnl)}`}>{formatINR(totalRealisedPnl)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* ════════════ 8. P&L CHART ════════════ */}
      {chartData.length > 0 && (
        <motion.div {...fadeIn} className="glass-card p-3 sm:p-5">
          <h2 className="text-sm sm:text-base font-bold mb-3 sm:mb-4 flex items-center gap-2">📊 Daily P&L</h2>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `₹${v}`} />
              <Tooltip contentStyle={{ background: '#0f1523', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                formatter={(value, name) => [formatINR(Number(value ?? 0)), name === 'pnl' ? 'Daily' : 'Cum.']}
                labelStyle={{ color: '#9ca3af' }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.pnl >= 0 ? '#00d4aa' : '#ff4757'} fillOpacity={0.7} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="cumulative" stroke="#00b4d8" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* ════════════ 9. UPSTOX LIVE DATA ════════════ */}
      {isAuth && (
        <motion.div {...fadeIn} className="glass-card overflow-hidden">
          <div className="flex border-b border-white/5 overflow-x-auto">
            {(['positions', 'orders', 'funds'] as const).map(tab => (
              <button key={tab} onClick={() => setLiveDataTab(tab)}
                className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-all capitalize whitespace-nowrap ${liveDataTab === tab ? `text-${modeAccent} border-b-2 border-${modeAccent} bg-white/[0.02]` : 'text-gray-500 hover:text-gray-300'}`}>
                {tab === 'positions' ? '📊 Pos' : tab === 'orders' ? '📋 Orders' : '💰 Funds'}
              </button>
            ))}
          </div>
          <div className="p-3 sm:p-4">
            {liveDataTab === 'positions' && (
              livePositions?.data && Array.isArray(livePositions.data) && livePositions.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-white/5">
                        {Object.keys(livePositions.data[0] || {}).slice(0, 8).map((k: string) => (
                          <th key={k} className="px-3 py-2 text-left font-medium">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {livePositions.data.map((p: Record<string, unknown>, i: number) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          {Object.values(p).slice(0, 8).map((v, j) => (
                            <td key={j} className="px-3 py-2 text-gray-300">{String(v ?? '-')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-gray-500 text-sm text-center py-4">No live positions data</p>
            )}
            {liveDataTab === 'orders' && (
              liveOrders?.data && Array.isArray(liveOrders.data) && liveOrders.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-white/5">
                        {Object.keys(liveOrders.data[0] || {}).slice(0, 8).map((k: string) => (
                          <th key={k} className="px-3 py-2 text-left font-medium">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {liveOrders.data.map((o: Record<string, unknown>, i: number) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          {Object.values(o).slice(0, 8).map((v, j) => (
                            <td key={j} className="px-3 py-2 text-gray-300">{String(v ?? '-')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-gray-500 text-sm text-center py-4">No orders data</p>
            )}
            {liveDataTab === 'funds' && (
              upstoxStatus?.funds ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(upstoxStatus.funds).map(([k, v]) => (
                    <div key={k} className="bg-dark-800/50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{k}</p>
                      <p className="text-lg font-bold text-white">{typeof v === 'number' ? formatINR(v) : String(v)}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-500 text-sm text-center py-4">No funds data — authenticate first</p>
            )}
          </div>
        </motion.div>
      )}

      {/* ════════════ 10. ACTIVITY LOG ════════════ */}
      <motion.div {...fadeIn} className="glass-card overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-white/5">
          <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">📜 Activity Log <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full">{logs.length}</span></h2>
        </div>
        <div ref={logRef} className="max-h-52 sm:max-h-72 overflow-y-auto p-3 sm:p-4 space-y-0.5 sm:space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No log entries</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="flex items-start gap-1.5 sm:gap-2 py-1 sm:py-1.5 text-xs sm:text-sm border-b border-white/[0.02] last:border-0">
                <span className="text-[10px] sm:text-xs text-gray-600 font-mono w-12 sm:w-16 shrink-0">{entry.time}</span>
                <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${logBadge(entry.type)}`}>{entry.type}</span>
                <span className="text-gray-300 break-all text-[11px] sm:text-sm leading-tight">{entry.msg}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </motion.div>

      {/* ════════════ 11. BOT CONFIG DISPLAY ════════════ */}
      {config && (
        <motion.div {...fadeIn} className="glass-card overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-white/5">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">⚙️ Bot Configuration</h2>
          </div>
          <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {Object.entries(config).map(([k, v]) => (
              <div key={k} className="bg-dark-800/50 rounded-lg p-2 sm:p-3 group">
                <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1 truncate">{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                <p className="text-xs sm:text-sm font-semibold text-white truncate">
                  {typeof v === 'boolean' ? (v ? '✅ Yes' : '❌ No') : typeof v === 'number' && k.includes('loss') || k.includes('size') || k.includes('capital') ? formatINR(v as number) : String(v)}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── Error state ─── */}
      {(upstoxErr || (!sseConnected && isAuthenticated && botStatus)) && (
        <motion.div {...fadeIn} className="glass-card p-6 border-2 border-accent-red/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold text-accent-red">Connection Error</h3>
              <p className="text-sm text-gray-400 mt-1">
                {upstoxErr ? 'Unable to reach the trading API.' : 'Live stream disconnected. Reconnecting...'} Data may be stale.
              </p>
              <button onClick={refreshAll} className="mt-3 px-4 py-2 rounded-lg text-sm bg-accent-gold/20 text-accent-gold hover:bg-accent-gold/30 border border-accent-gold/30 transition-all">
                🔄 Retry
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Initial loading state ─── */}
      {!botStatus && isAuthenticated && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="skeleton h-5 w-40 mb-3" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
