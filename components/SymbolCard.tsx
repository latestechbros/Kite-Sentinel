
import React from 'react';
import { PNFResult, SymbolConfig, ColumnType } from '../types';

interface SymbolCardProps {
  symbol: SymbolConfig;
  data: PNFResult | null;
  isLoading: boolean;
}

const SymbolCard: React.FC<SymbolCardProps> = ({ symbol, data, isLoading }) => {
  if (isLoading || !data) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse">
        <div className="h-6 w-24 bg-slate-700 rounded mb-4"></div>
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-700 rounded-sm"></div>
          ))}
        </div>
      </div>
    );
  }

  const latestCol = data.columns[data.columns.length - 1];
  const prevCol = data.columns[data.columns.length - 2];

  // Display only the last 10 columns for compact view
  const displayColumns = data.columns.slice(-10);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-colors shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{symbol.tradingsymbol}</h3>
          <p className="text-xs text-slate-400 mono">ATR Box: {data.currentBoxSize.toFixed(2)}</p>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-bold ${latestCol.type === ColumnType.X ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          CURRENT: {latestCol.type}
        </div>
      </div>

      {/* P&F Grid Visualization */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide h-40 items-end border-b border-slate-700/50 mb-3">
        {displayColumns.map((col, idx) => (
          <div key={idx} className="flex flex-col-reverse items-center min-w-[20px]">
            {col.boxes.map((box, bIdx) => (
              <div 
                key={bIdx} 
                className={`w-4 h-4 text-[10px] flex items-center justify-center font-bold mb-[1px]
                  ${col.type === ColumnType.X ? 'text-green-400' : 'text-red-400'}`}
              >
                {col.type}
              </div>
            ))}
            <div className="text-[8px] text-slate-500 mt-1 mono">{idx === displayColumns.length - 1 ? 'Now' : ''}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-400 mono">
        <span>Col Count: {data.columns.length}</span>
        <span>Reversal: 3x</span>
      </div>
    </div>
  );
};

export default SymbolCard;
