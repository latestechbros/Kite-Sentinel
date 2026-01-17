
import { SymbolConfig } from './types';

export const WATCHLIST: SymbolConfig[] = [
  { tradingsymbol: 'NIFTY 50', instrument_token: 256265, exchange: 'NSE' },
  { tradingsymbol: 'NIFTY BANK', instrument_token: 260105, exchange: 'NSE' },
  { tradingsymbol: 'RELIANCE', instrument_token: 738561, exchange: 'NSE' },
  { tradingsymbol: 'HDFCBANK', instrument_token: 341249, exchange: 'NSE' },
  { tradingsymbol: 'ICICIBANK', instrument_token: 1270529, exchange: 'NSE' },
  { tradingsymbol: 'INFY', instrument_token: 408065, exchange: 'NSE' },
  { tradingsymbol: 'TCS', instrument_token: 2953213, exchange: 'NSE' },
  { tradingsymbol: 'ITC', instrument_token: 424961, exchange: 'NSE' }
];

export const MARKET_HOURS = {
  start: { hour: 9, minute: 15 },
  end: { hour: 15, minute: 30 }
};

export const PNF_CONFIG = {
  interval: '30minute',
  atrLength: 14,
  reversalAmount: 3
};

export const FETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
export const UI_REFRESH_INTERVAL_MS = 10000; // 10 seconds for clock/status
