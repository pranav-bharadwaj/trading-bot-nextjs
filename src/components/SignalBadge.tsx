'use client';

import { motion } from 'framer-motion';
import { getSignalColor, getSignalBg } from '@/lib/utils';

interface SignalBadgeProps {
  signal: string;
  confidence?: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function SignalBadge({ signal, confidence, size = 'md' }: SignalBadgeProps) {
  if (!signal) return null;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-3 py-1',
    lg: 'text-sm px-4 py-1.5',
  };

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${sizeClasses[size]} ${getSignalBg(signal)} ${getSignalColor(signal)}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${
        signal.toUpperCase().includes('BUY') ? 'bg-accent-green' :
        signal.toUpperCase().includes('SELL') ? 'bg-accent-red' : 'bg-accent-gold'
      }`} />
      {signal}
      {confidence !== undefined && (
        <span className="text-[10px] opacity-70 ml-0.5">{confidence.toFixed(0)}%</span>
      )}
    </motion.span>
  );
}
