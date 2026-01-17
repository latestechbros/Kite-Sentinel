
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export enum ColumnType {
  X = 'X',
  O = 'O'
}

export interface PNFColumn {
  type: ColumnType;
  boxes: number[];
  high: number;
  low: number;
}

export interface PNFResult {
  columns: PNFColumn[];
  currentBoxSize: number;
  lastUpdated: string;
}

export interface SymbolConfig {
  tradingsymbol: string;
  instrument_token: number;
  exchange: string;
}

export interface AppState {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  telegramBotToken: string;
  telegramChatId: string;
  isAutoRunning: boolean;
  marketStatus: 'OPEN' | 'CLOSED';
}

export interface AlertLog {
  id: string;
  timestamp: string;
  symbol: string;
  message: string;
  type: ColumnType;
}
