'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', short: 'Dash', icon: '📊' },
  { href: '/scanner', label: 'Scanner', short: 'Scan', icon: '🔍' },
  { href: '/predictions', label: 'AI Predictions', short: 'Predict', icon: '🤖' },
  { href: '/ai-scanner', label: 'AI Scanner', short: 'AI', icon: '🧠' },
  { href: '/auto-trader', label: 'Auto Trader', short: 'Auto', icon: '⚡' },
  { href: '/real-trading', label: 'Real Trading', short: 'Trade', icon: '💹' },
  { href: '/analytics', label: 'Analytics', short: 'Stats', icon: '📈' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-900/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 group shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center text-base sm:text-lg font-bold text-dark-900 group-hover:shadow-lg group-hover:shadow-accent-green/20 transition-shadow">
              ₹
            </div>
            <span className="font-bold text-base sm:text-lg hidden sm:block">
              <span className="gradient-text">AI Trading</span>
              <span className="text-gray-400 text-sm ml-1">Bot</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={`relative px-3 xl:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive ? 'text-accent-green' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}>
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">{item.icon}</span>
                    <span className="hidden xl:inline">{item.label}</span>
                    <span className="xl:hidden">{item.short}</span>
                  </span>
                  {isActive && (
                    <motion.div layoutId="navbar-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-accent-green to-accent-blue rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side: LIVE indicator + hamburger */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-green/10 border border-accent-green/20">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              <span className="text-accent-green text-[10px] sm:text-xs font-medium">LIVE</span>
            </div>

            {/* Mobile hamburger */}
            <button className="lg:hidden p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu with AnimatePresence for smooth exit */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden overflow-hidden bg-dark-800/95 backdrop-blur-lg border-b border-white/5"
          >
            <div className="py-2 px-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                      isActive ? 'text-accent-green bg-accent-green/10 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}>
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-green" />}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
