'use client';

import useSWR from 'swr';
import { API_BASE } from '@/lib/api';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
});

/* ── Market Hours Helper ──
   NSE: 9:15 AM – 3:30 PM IST
   We allow polling 30 min before open (8:45) and 30 min after close (4:00 PM)
   Outside this window: no auto-refresh, data fetched only on page load */

function isMarketWindow(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  // Weekend — no polling
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  // 8:45 AM (525) to 4:00 PM (960)
  return minutes >= 525 && minutes <= 960;
}

function marketAwareInterval(requestedInterval: number): number {
  return isMarketWindow() ? requestedInterval : 0; // 0 = no auto-refresh
}

export function useNiftyData(refreshInterval = 15000) {
  return useSWR(`${API_BASE}/api/stocks`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
    dedupingInterval: 5000,
  });
}

export function useStockPrediction(symbol: string | null, withMC = false) {
  const url = symbol
    ? `${API_BASE}/api/prediction/${encodeURIComponent(symbol)}`
    : null;
  return useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useScanner(refreshInterval = 30000) {
  return useSWR(`${API_BASE}/api/ai_scanner`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
    dedupingInterval: 10000,
  });
}

export function useStockDetail(symbol: string | null) {
  const url = symbol ? `${API_BASE}/api/stock_predict/${encodeURIComponent(symbol)}` : null;
  return useSWR(url, fetcher, {
    revalidateOnFocus: false,
  });
}

export function useOptions(symbol: string | null) {
  const url = symbol ? `${API_BASE}/api/options/${encodeURIComponent(symbol)}` : null;
  return useSWR(url, fetcher, {
    revalidateOnFocus: false,
  });
}

export function useBotStatus(refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/bot/status`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
    dedupingInterval: 5000,
    errorRetryCount: 3,
  });
}

export function useBotPositions(refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/bot/positions`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
    dedupingInterval: 5000,
  });
}

export function useBotWeekly(refreshInterval = 30000) {
  return useSWR(`${API_BASE}/api/bot/weekly`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
  });
}

export function useBotLog(refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/bot/log`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
  });
}

export function useIndexData(name: string, tf = '5m', refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/index/${name}?tf=${tf}`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
  });
}

export function useOrderFlow(name: string, refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/order_flow/${name}`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
  });
}

export function useLivePrice(name: string, refreshInterval = 5000) {
  return useSWR(`${API_BASE}/api/live_price/${name}`, fetcher, {
    refreshInterval: marketAwareInterval(refreshInterval),
    revalidateOnFocus: isMarketWindow(),
  });
}

export function usePrediction(index: string, days = 5, model = 'all', refreshInterval = 30000) {
  return useSWR(
    `${API_BASE}/api/prediction/${index}?days=${days}&sims=5000&model=${model}`,
    fetcher,
    {
      refreshInterval: marketAwareInterval(refreshInterval),
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );
}

export { isMarketWindow };
