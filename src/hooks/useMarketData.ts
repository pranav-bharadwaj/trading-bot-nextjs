'use client';

import useSWR from 'swr';
import { API_BASE } from '@/lib/api';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
});

export function useNiftyData(refreshInterval = 15000) {
  return useSWR(`${API_BASE}/api/stocks`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
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
    refreshInterval,
    revalidateOnFocus: true,
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
    refreshInterval,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
}

export function useBotPositions(refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/bot/positions`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
}

export function useBotWeekly(refreshInterval = 30000) {
  return useSWR(`${API_BASE}/api/bot/weekly`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });
}

export function useBotLog(refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/bot/log`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });
}

export function useIndexData(name: string, tf = '5m', refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/index/${name}?tf=${tf}`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });
}

export function useOrderFlow(name: string, refreshInterval = 10000) {
  return useSWR(`${API_BASE}/api/order_flow/${name}`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });
}

export function useLivePrice(name: string, refreshInterval = 5000) {
  return useSWR(`${API_BASE}/api/live_price/${name}`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });
}

export function usePrediction(index: string, days = 5, model = 'all', refreshInterval = 30000) {
  return useSWR(
    `${API_BASE}/api/prediction/${index}?days=${days}&sims=5000&model=${model}`,
    fetcher,
    { refreshInterval, revalidateOnFocus: false, dedupingInterval: 10000 }
  );
}
