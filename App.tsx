
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
import { TOTPUtils } from './services/authUtils';
import SymbolCard from './components/SymbolCard';

interface ExtendedState extends AppState {
  totpSecret: string;
  userId: string;
  password: string;
}

const App: React.FC = () => {
  const [state, setState] = useState<ExtendedState>({
    apiKey: localStorage.getItem('kite_api_key') || '',
    apiSecret: localStorage.getItem('kite_api_secret') || '',
    accessToken: localStorage.getItem('kite_access_token') || '',
    telegramBotToken: localStorage.getItem('tg_bot_token') || '',
    telegramChatId: localStorage.getItem('tg_chat_id') || '',
    totpSecret: localStorage.getItem('kite_totp_secret') || '',
    userId: localStorage.getItem('kite_user_id') || '',
    password: localStorage.getItem('kite_password') || '',
    isAutoRunning: localStorage.getItem('is_auto_running') === 'true',
    marketStatus: 'CLOSED'
  });

  const [pnfData, setPnfData] = useState<Record<string, PNFResult>>({});
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<'IDLE' | 'AUTHENTICATING' | 'READY'>('IDLE');
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());
  const [currentTotp, setCurrentTotp] = useState<{ code: string; timeLeft: number }>({ code: '------', timeLeft: 0 });
  const [showLoginHelper, setShowLoginHelper] = useState<boolean>(false);
  
  const lastColumnState = useRef<Record<string, { count: number, type: ColumnType }>>({});

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const requestToken = urlParams.get('request_token');

    if (requestToken && state.apiKey && state.apiSecret) {
      const handleTokenExchange = async (token: string) => {
        setAuthStatus('AUTHENTICATING');
        try {
          const accessToken = await KiteService.exchangeToken(state.apiKey, state.apiSecret, token);
          setState(prev => ({ ...prev, accessToken }));
          localStorage.setItem('kite_access_token', accessToken);
          setAuthStatus('READY');
          setShowLoginHelper(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error("Auth failed:", error);
          setAuthStatus('IDLE');
          alert("Authentication failed. Check your API settings.");
        }
      };
      handleTokenExchange(requestToken);
    } else if (state.accessToken) {
      setAuthStatus('READY');
    }

    const totpInterval = setInterval(async () => {
      if (state.totpSecret) {
        const totp = await TOTPUtils.generateTOTP(state.totpSecret);
        setCurrentTotp(totp);
      }
    }, 1000);

    return () => clearInterval(totpInterval);
  }, [state.apiKey, state.apiSecret, state.accessToken, state.totpSecret]);

  const redirectToKite = () => {
    if (!state.apiKey) return alert("Enter API Key in settings first!");
    setShowLoginHelper(true);
    window.open(`https://kite.zerodha.com/connect/login?api_key=${state.apiKey}&v=3`, '_blank');
  };

  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const { start, end } = MARKET_HOURS;
    const startTime = new Date(now);
    startTime.setHours(start.hour, start.minute, 0);
    const endTime = new Date(now);
    endTime.setHours(end.hour, end.minute, 0);
    return now >= startTime && now <= endTime;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!state.accessToken) return;
    setIsLoading(true);
    const kite = new KiteService(state.apiKey, state.accessToken);
    const newResults: Record<string, PNFResult> = {};

    for (const symbol of WATCHLIST) {
      try {
        const candles = await kite.fetchHistoricalData(symbol, PNF_CONFIG.interval);
        const pnf = generatePNF(candles, PNF_CONFIG.atrLength, PNF_CONFIG.reversalAmount);
        newResults[symbol.tradingsymbol] = pnf;

        const currentColumnCount = pnf.columns.length;
        const currentType = pnf.columns[pnf.columns.length - 1].type;
        const prevState = lastColumnState.current[symbol.tradingsymbol];

        if (prevState && (prevState.count !== currentColumnCount || prevState.type !== currentType)) {
          const msg = `🚨 *P&F Alert: ${symbol.tradingsymbol}*\n` +
                      `New Column: *${currentType}*\n` +
                      `ATR Box: ${pnf.currentBoxSize.toFixed(2)}\n` +
                      `${new Date().toLocaleTimeString()}`;
          sendTelegramAlert(state.telegramBotToken, state.telegramChatId, msg);
          setAlerts(prev => [{
            id: Math.random().toString(36).substring(2, 11),
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
  }, [state.apiKey, state.accessToken, state.telegramBotToken, state.telegramChatId]);

  useEffect(() => {
    let timer: any;
    if (state.isAutoRunning && authStatus === 'READY') {
      runAnalysis();
      timer = setInterval(() => {
        if (isMarketOpen()) runAnalysis();
      }, FETCH_INTERVAL_MS);
    }
    return () => clearInterval(timer);
  }, [state.isAutoRunning, authStatus, runAnalysis, isMarketOpen]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      setState(prev => ({ ...prev, marketStatus: isMarketOpen() ? 'OPEN' : 'CLOSED' }));
    }, UI_REFRESH_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [isMarketOpen]);

  const toggleAutoRun = () => {
    const newState = !state.isAutoRunning;
    setState(prev => ({ ...prev, isAutoRunning: newState }));
    localStorage.setItem('is_auto_running', String(newState));
  };

  const updateConfig = (key: keyof ExtendedState, value: string) => {
    setState(prev => ({ ...prev, [key]: value }));
    const storageKeys: Record<string, string> = { 
      apiKey: 'kite_api_key', 
      apiSecret: 'kite_api_secret', 
      telegramBotToken: 'tg_bot_token', 
      telegramChatId: 'tg_chat_id',
      totpSecret: 'kite_totp_secret',
      userId: 'kite_user_id',
      password: 'kite_password'
    };
    if (storageKeys[key]) localStorage.setItem(storageKeys[key], value);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto relative">
      {/* 1-Tap Login Overlay */}
      {showLoginHelper && authStatus !== 'READY' && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-slate-900 border-2 border-blue-500 rounded-2xl shadow-2xl p-6 animate-bounce-subtle">
           <div className="flex justify-between items-center mb-4">
              <h4 className="text-white font-bold flex items-center gap-2">
                 <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
                 Kite Login Assistant
              </h4>
              <button onClick={() => setShowLoginHelper(false)} className="text-slate-500 hover:text-white">&times;</button>
           </div>
           <div className="grid grid-cols-3 gap-2">
              <button onClick={() => copyToClipboard(state.userId, 'User ID')} className="bg-slate-800 hover:bg-slate-700 p-3 rounded-xl border border-slate-700 flex flex-col items-center gap-1 transition-colors">
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">User ID</span>
                <span className="text-xs text-blue-400 font-bold truncate w-full text-center">{state.userId || '...'}</span>
              </button>
              <button onClick={() => copyToClipboard(state.password, 'Password')} className="bg-slate-800 hover:bg-slate-700 p-3 rounded-xl border border-slate-700 flex flex-col items-center gap-1 transition-colors">
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Password</span>
                <span className="text-xs text-blue-400 font-bold">••••••</span>
              </button>
              <button onClick={() => copyToClipboard(currentTotp.code, 'TOTP')} className="bg-blue-600 hover:bg-blue-500 p-3 rounded-xl flex flex-col items-center gap-1 transition-colors">
                <span className="text-[9px] uppercase font-bold text-blue-200 tracking-wider">2FA TOTP</span>
                <span className="text-xs text-white font-bold font-mono">{currentTotp.code}</span>
              </button>
           </div>
           <p className="text-[10px] text-slate-400 mt-4 text-center">Click a button to copy, then paste in the Zerodha tab. This window will close once login completes.</p>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <h1 className="text-3xl font-extrabold text-white">Kite P&F Sentinel</h1>
          </div>
          <div className="flex items-center gap-4 mt-1">
             <p className="text-slate-400 text-sm">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${state.marketStatus === 'OPEN' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {state.marketStatus} • {currentTime}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {authStatus !== 'READY' ? (
            <button 
              onClick={redirectToKite}
              disabled={authStatus === 'AUTHENTICATING'}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
            >
              {authStatus === 'AUTHENTICATING' ? 'Authenticating...' : 'Connect to Zerodha'}
            </button>
          ) : (
            <button 
              onClick={toggleAutoRun}
              className={`px-6 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 shadow-lg
                ${state.isAutoRunning ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
            >
              {state.isAutoRunning ? 'Stop Monitoring' : 'Start Auto-Sentinel'}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-200">Watchlist Monitor</h2>
            </div>
            
            {authStatus !== 'READY' ? (
              <div className="bg-slate-800/50 border border-slate-700 border-dashed rounded-2xl p-16 text-center">
                 <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                <h3 className="text-white font-bold text-lg mb-2">Authentication Required</h3>
                <p className="text-slate-400 mb-6 max-w-sm mx-auto">Fill your login details in the sidebar, then click **Connect to Zerodha**. Use the helper panel to copy-paste your credentials into the login page.</p>
                <button onClick={redirectToKite} className="text-blue-400 font-bold hover:underline underline-offset-4">Open Kite Login Hub &rarr;</button>
              </div>
            ) : (
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
            )}
          </section>

          <section className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
            <h2 className="text-xl font-bold text-slate-200 mb-4">Signal History</h2>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-slate-500 italic text-sm">Monitoring for new P&F column alerts...</div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} className="bg-slate-900/50 border-l-4 border-blue-500 p-3 rounded-r-lg flex justify-between items-center group hover:bg-slate-900 transition-colors">
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

        <aside className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
               <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
               Credential Vault
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kite User ID</label>
                <input 
                  type="text" 
                  value={state.userId}
                  onChange={(e) => updateConfig('userId', e.target.value)}
                  placeholder="e.g. AB1234"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kite Password</label>
                <input 
                  type="password" 
                  value={state.password}
                  onChange={(e) => updateConfig('password', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TOTP Secret</label>
                <input 
                  type="password" 
                  value={state.totpSecret}
                  onChange={(e) => updateConfig('totpSecret', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="pt-4 border-t border-slate-700/50">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">API Key</label>
                <input 
                  type="password" 
                  value={state.apiKey}
                  onChange={(e) => updateConfig('apiKey', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">API Secret</label>
                <input 
                  type="password" 
                  value={state.apiSecret}
                  onChange={(e) => updateConfig('apiSecret', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="pt-4 border-t border-slate-700/50">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TG Bot Token</label>
                <input 
                  type="password" 
                  value={state.telegramBotToken}
                  onChange={(e) => updateConfig('telegramBotToken', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TG Chat ID</label>
                <input 
                  type="text" 
                  value={state.telegramChatId}
                  onChange={(e) => updateConfig('telegramChatId', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg">
             <div className="flex items-center justify-between mb-3">
                <h4 className="text-slate-400 font-bold text-[10px] uppercase">Live Auth Tokens</h4>
                <div className={`w-2 h-2 rounded-full ${authStatus === 'READY' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xl font-mono font-bold text-white tracking-widest">{currentTotp.code}</span>
                <span className="text-[10px] text-slate-500 font-mono">{currentTotp.timeLeft}s</span>
             </div>
             <div className="mt-2 w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${(currentTotp.timeLeft / 30) * 100}%` }}></div>
             </div>
          </div>
        </aside>
      </div>
      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -5px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
