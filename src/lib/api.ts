const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://pranavbharadwaj.pythonanywhere.com';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Dashboard ──
export const getIndexData = (symbol: string) =>
  fetchAPI<Record<string, unknown>>(`/api/prediction/${encodeURIComponent(symbol)}`);

export const getNiftyData = () =>
  fetchAPI<Record<string, unknown>>('/api/stocks');

// ── Stock Scanner ──
export const getScannerData = () =>
  fetchAPI<Record<string, unknown>>('/api/ai_scanner');

export const getStockAnalysis = (symbol: string) =>
  fetchAPI<Record<string, unknown>>(`/api/stock_predict/${encodeURIComponent(symbol)}`);

// ── Predictions ──
export const getPrediction = (symbol: string) =>
  fetchAPI<Record<string, unknown>>(`/api/stock_predict/${encodeURIComponent(symbol)}`);

// ── Options ──
export const getOptionsAnalysis = (symbol: string) =>
  fetchAPI<Record<string, unknown>>(`/api/options/${encodeURIComponent(symbol)}`);

// ── Auto Trader ──
export const getBotStatus = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/status');

export const getBotPositions = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/positions');

export const getBotWeekly = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/weekly');

export const getBotLog = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/log');

export const toggleBot = (action: 'start' | 'stop') =>
  fetchAPI<Record<string, unknown>>(`/api/bot/toggle?action=${action}`, { method: 'POST' });

export const closeTrade = (tradeId: number) =>
  fetchAPI<Record<string, unknown>>(`/api/bot/close?trade_id=${tradeId}`, { method: 'POST' });

export const closeAllTrades = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/close_all', { method: 'POST' });

export const resetBot = () =>
  fetchAPI<Record<string, unknown>>('/api/bot/reset', { method: 'POST' });

export { API_BASE };
