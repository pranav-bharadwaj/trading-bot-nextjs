// ─── TypeScript types for the trading bot ───

export interface StockPrice {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: string;
}

export interface TradingSignal {
  strategy: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  details: string;
}

export interface PredictionResult {
  symbol: string;
  current_price: number;
  monte_carlo?: {
    mean_price: number;
    median_price: number;
    percentile_5: number;
    percentile_95: number;
    prob_up: number;
    prob_down: number;
    expected_return: number;
    volatility: number;
    paths?: number[][];
  };
  fvp?: {
    fair_value: number;
    signal: string;
    upside: number;
    pe_ratio: number;
    pb_ratio: number;
  };
  amd?: {
    predicted_price: number;
    signal: string;
    confidence: number;
    trend: string;
    momentum: number;
    volatility_regime: string;
  };
  consensus?: {
    signal: string;
    confidence: number;
    avg_target: number;
    models_agree: number;
  };
}

export interface ScannerStock {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  signal: string;
  confidence: number;
  entry: number;
  target: number;
  stop_loss: number;
  risk_reward: number;
  target_prob: number;
  volume_ratio: number;
  volatility: number;
  fvp_signal?: string;
  amd_signal?: string;
  momentum_signal?: string;
}

export interface OptionsLeg {
  type: 'BUY' | 'SELL';
  option_type: 'CE' | 'PE';
  strike: number;
  premium: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
}

export interface OptionsStrategy {
  name: string;
  legs: OptionsLeg[];
  net_premium: number;
  max_profit: number | string;
  max_loss: number;
  breakeven: number[];
  premium_target: number;
  premium_sl: number;
  lot_size: number;
  total_investment: number;
}

export interface OptionsAnalysis {
  symbol: string;
  spot_price: number;
  iv: number;
  expiry: string;
  atm_strike: number;
  recommended_strategy: string;
  strategies: Record<string, OptionsStrategy>;
  options_chain: OptionsChainRow[];
}

export interface OptionsChainRow {
  strike: number;
  ce_premium: number;
  pe_premium: number;
  ce_delta: number;
  pe_delta: number;
  ce_iv: number;
  pe_iv: number;
}

export interface BotPortfolio {
  initial_capital: number;
  available_capital: number;
  deployed_capital: number;
  realised_pnl: number;
  total_wins: number;
  total_losses: number;
  peak_capital: number;
  max_drawdown: number;
  unrealised_pnl: number;
  total_pnl: number;
}

export interface BotTrade {
  id: number;
  symbol: string;
  signal: string;
  confidence: number;
  option_strategy: string;
  strike: number;
  expiry: string;
  premium_entry: number;
  premium_current: number;
  premium_target: number;
  premium_sl: number;
  lot_size: number;
  lots: number;
  invested: number;
  pnl: number;
  pnl_pct: number;
  status: string;
  exit_reason: string;
  premium_exit: number;
  opened_at: string;
  closed_at: string;
  legs: string;
}

export interface BotStatus {
  running: boolean;
  last_scan: string;
  portfolio: BotPortfolio;
  stats: {
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    avg_pnl: number;
    best_trade: number;
    worst_trade: number;
  };
  open_positions: number;
  config: Record<string, unknown>;
}

export interface BotLogEntry {
  id: number;
  trade_id: number;
  ts: string;
  event: string;
  detail: string;
}

export interface WeeklyPnL {
  date: string;
  opened: number;
  closed: number;
  wins: number;
  losses: number;
  pnl: number;
  capital: number;
}

export interface IndexData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  signals: TradingSignal[];
  consensusSignal: string;
  consensusStrength: number;
}
