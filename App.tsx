
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  WATCHLIST, 
  MARKET_HOURS, 
  FETCH_INTERVAL_MS, 
  UI_REFRESH_INTERVAL_MS,
  PNF_CONFIG 
} from './constants';
import { AppState, PNFResult, AlertLog, ColumnType } from './types';
import { KiteService } from './services/kiteService';
import { generatePNF } from './services/pnfLogic';
import { sendTelegramAlert } from './services/telegramService';
import SymbolCard from './components/SymbolCard';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    apiKey: localStorage.getItem('kite_api_key') || '',
    apiSecret: localStorage.getItem('kite_api_secret') || '',
    accessToken: localStorage.getItem('kite_access_token') || '',
    telegramBotToken: localStorage.getItem('tg_bot_token') || '',
    telegramChatId: localStorage.getItem('tg_chat_id') || '',
    isAutoRunning: false,
    marketStatus: 'CLOSED'
  });

  const [pnfData, setPnfData] = useState<Record<string, PNFResult>>({});
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());
  
  const lastColumnState = useRef<Record<string, { count: number, type: ColumnType }>>({});

  // Market hours checker
  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false; // Weekend

    const { start, end } = MARKET_HOURS;
    const startTime = new Date(now);
    startTime.setHours(start.hour, start.minute, 0);
    
    const endTime = new Date(now);
    endTime.setHours(end.hour, end.minute, 0);

    return now >= startTime && now <= endTime;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!state.accessToken && !state.isAutoRunning) return;
    
    setIsLoading(true);
    const kite = new KiteService(state.apiKey, state.accessToken);
    const newResults: Record<string, PNFResult> = {};

    for (const symbol of WATCHLIST) {
      try {
        const candles = await kite.fetchHistoricalData(symbol, PNF_CONFIG.interval);
        const pnf = generatePNF(candles, PNF_CONFIG.atrLength, PNF_CONFIG.reversalAmount);
        newResults[symbol.tradingsymbol] = pnf;

        // Detection Logic for Alerts
        const currentColumnCount = pnf.columns.length;
        const currentType = pnf.columns[pnf.columns.length - 1].type;
        const prevState = lastColumnState.current[symbol.tradingsymbol];

        if (prevState && (prevState.count !== currentColumnCount || prevState.type !== currentType)) {
          const msg = `🚨 *P&F Alert: ${symbol.tradingsymbol}*\n` +
                      `New Column Detected: *${currentType}*\n` +
                      `Interval: 30m | ATR Box Size: ${pnf.currentBoxSize.toFixed(2)}\n` +
                      `Time: ${new Date().toLocaleTimeString()}`;
          
          await sendTelegramAlert(state.telegramBotToken, state.telegramChatId, msg);
          
          setAlerts(prev => [{
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            symbol: symbol.tradingsymbol,
            message: `New ${currentType} column formed`,
            type: currentType
          }, ...prev].slice(0, 50));
        }

        lastColumnState.current[symbol.tradingsymbol] = { count: currentColumnCount, type: currentType };
      } catch (err) {
        console.error(`Error processing ${symbol.tradingsymbol}:`, err);
      }
    }

    setPnfData(newResults);
    setIsLoading(false);
  }, [state]);

  // Main automation loop
  useEffect(() => {
    let timer: any;
    if (state.isAutoRunning) {
      runAnalysis();
      timer = setInterval(() => {
        if (isMarketOpen()) {
          runAnalysis();
        }
      }, FETCH_INTERVAL_MS);
    }
    return () => clearInterval(timer);
  }, [state.isAutoRunning, runAnalysis, isMarketOpen]);

  // UI Tick
  useEffect(() => {
    const tick = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      setState(prev => ({ ...prev, marketStatus: isMarketOpen() ? 'OPEN' : 'CLOSED' }));
    }, UI_REFRESH_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [isMarketOpen]);

  const toggleAutoRun = async () => {
    if (!state.isAutoRunning) {
      if (!state.apiKey || !state.apiSecret) {
        alert("Please set API Key and Secret first!");
        return;
      }
      // Automated login simulation
      const token = await KiteService.getAutoAccessToken(state.apiKey, state.apiSecret);
      setState(prev => ({ ...prev, accessToken: token, isAutoRunning: true }));
      localStorage.setItem('kite_access_token', token);
    } else {
      setState(prev => ({ ...prev, isAutoRunning: false }));
    }
  };

  const updateConfig = (key: keyof AppState, value: string) => {
    setState(prev => ({ ...prev, [key]: value }));
    localStorage.setItem(key === 'apiKey' ? 'kite_api_key' : key === 'apiSecret' ? 'kite_api_secret' : key === 'telegramBotToken' ? 'tg_bot_token' : 'tg_chat_id', value);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Kite P&F Sentinel</h1>
          </div>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${state.marketStatus === 'OPEN' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            Market Status: {state.marketStatus} • {currentTime}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleAutoRun}
            className={`px-6 py-2.5 rounded-lg font-bold transition-all transform active:scale-95 flex items-center gap-2 shadow-lg
              ${state.isAutoRunning 
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/20' 
                : 'bg-green-500 hover:bg-green-600 text-white shadow-green-900/20'}`}
          >
            {state.isAutoRunning ? (
              <><span className="w-3 h-3 bg-white rounded-full animate-ping"></span> Stop Monitoring</>
            ) : (
              <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg> Start Auto-Sentinel</>
            )}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Dashboard Grid */}
        <div className="lg:col-span-3 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-200">Active Watchlist</h2>
              <button onClick={runAnalysis} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                <svg className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Manual Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {WATCHLIST.map(symbol => (
                <SymbolCard 
                  key={symbol.tradingsymbol} 
                  symbol={symbol} 
                  data={pnfData[symbol.tradingsymbol]} 
                  isLoading={isLoading && !pnfData[symbol.tradingsymbol]}
                />
              ))}
            </div>
          </section>

          {/* Alert Feed */}
          <section className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
            <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              Live Signal Feed
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 italic">No signals detected yet. System is monitoring...</div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} className="bg-slate-900/50 border-l-4 border-l-blue-500 p-3 rounded-r-lg flex justify-between items-center group hover:bg-slate-900 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{alert.symbol}</span>
                        <span className={`text-[10px] font-bold px-1.5 rounded ${alert.type === ColumnType.X ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>{alert.type}</span>
                      </div>
                      <p className="text-sm text-slate-400">{alert.message}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 mono">{alert.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Settings */}
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Configurations
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Kite API Key</label>
                <input 
                  type="password" 
                  value={state.apiKey}
                  onChange={(e) => updateConfig('apiKey', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter API Key"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Kite API Secret</label>
                <input 
                  type="password" 
                  value={state.apiSecret}
                  onChange={(e) => updateConfig('apiSecret', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter API Secret"
                />
              </div>
              <div className="pt-4 border-t border-slate-700/50">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Telegram Bot Token</label>
                <input 
                  type="password" 
                  value={state.telegramBotToken}
                  onChange={(e) => updateConfig('telegramBotToken', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="bot123456:ABC..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Telegram Chat ID</label>
                <input 
                  type="text" 
                  value={state.telegramChatId}
                  onChange={(e) => updateConfig('telegramChatId', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="-100..."
                />
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-700/50">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3">System Health</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">EC2 Status</span>
                  <span className="text-green-400 font-bold">Online</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Auto-Refresher</span>
                  <span className={state.isAutoRunning ? "text-green-400 font-bold" : "text-slate-600 font-bold"}>
                    {state.isAutoRunning ? "Active (30m)" : "Idle"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-900/20">
            <h3 className="font-bold text-lg mb-2">EC2 Production Tip</h3>
            <p className="text-xs text-blue-100 leading-relaxed mb-4">
              To keep this running 24/7 on your Windows EC2, leave this browser tab open and ensure the machine doesn't enter sleep mode. The app uses localStorage to persist your credentials safely.
            </p>
            <div className="bg-white/10 p-3 rounded-lg flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-200 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span className="text-[10px] text-blue-50 text-balance">Ensure your Kite Redirect URL matches your EC2 instance's IP for automated session handling.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
