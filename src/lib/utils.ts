import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: string[]) {
  return inputs.filter(Boolean).join(' ');
}

export function formatCurrency(value: number | null | undefined, symbol = '₹'): string {
  if (value == null || isNaN(value)) return `${symbol}0`;
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${symbol}${(value / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${symbol}${(value / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${symbol}${(value / 1000).toFixed(1)}K`;
  return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value)) return '0';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getSignalColor(signal: string): string {
  if (!signal) return 'text-gray-400';
  const s = signal.toUpperCase();
  if (s.includes('BUY') || s.includes('BULLISH') || s.includes('STRONG BUY')) return 'text-accent-green';
  if (s.includes('SELL') || s.includes('BEARISH') || s.includes('STRONG SELL')) return 'text-accent-red';
  return 'text-accent-gold';
}

export function getSignalBg(signal: string): string {
  if (!signal) return 'bg-gray-700/30';
  const s = signal.toUpperCase();
  if (s.includes('BUY') || s.includes('BULLISH')) return 'bg-accent-green/10 border-accent-green/30';
  if (s.includes('SELL') || s.includes('BEARISH')) return 'bg-accent-red/10 border-accent-red/30';
  return 'bg-accent-gold/10 border-accent-gold/30';
}

export function getPnlColor(value: number): string {
  if (value > 0) return 'text-accent-green';
  if (value < 0) return 'text-accent-red';
  return 'text-gray-400';
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
