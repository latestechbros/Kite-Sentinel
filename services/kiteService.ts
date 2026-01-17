
import { Candle, SymbolConfig } from '../types';

export class KiteService {
  private apiKey: string;
  private accessToken: string;
  private baseUrl = 'https://api.kite.trade';

  constructor(apiKey: string, accessToken: string) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
  }

  /**
   * Generates the SHA256 checksum required by Zerodha
   */
  private static async generateChecksum(apiKey: string, requestToken: string, apiSecret: string): Promise<string> {
    const message = apiKey + requestToken + apiSecret;
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Exchanges request_token for access_token
   */
  static async exchangeToken(apiKey: string, apiSecret: string, requestToken: string): Promise<string> {
    const checksum = await this.generateChecksum(apiKey, requestToken, apiSecret);
    
    const formData = new URLSearchParams();
    formData.append('api_key', apiKey);
    formData.append('request_token', requestToken);
    formData.append('checksum', checksum);

    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3'
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to exchange token');
    }

    const data = await response.json();
    return data.data.access_token;
  }

  async fetchHistoricalData(symbol: SymbolConfig, interval: string): Promise<Candle[]> {
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const url = `${this.baseUrl}/instruments/historical/${symbol.instrument_token}/${interval}?from=${fromDate}&to=${toDate}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Kite API Error: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data.candles.map((c: any) => ({
        date: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
      }));
    } catch (error) {
      console.warn("Falling back to mock data due to API error (check CORS/Token):", error);
      return this.getMockData(symbol);
    }
  }

  private getMockData(symbol: SymbolConfig): Candle[] {
    const candles: Candle[] = [];
    let lastPrice = 1000 + Math.random() * 500;
    const now = new Date();
    for (let i = 100; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 30 * 60 * 1000);
      const change = (Math.random() - 0.48) * 15;
      const open = lastPrice;
      const close = open + change;
      candles.push({
        date: date.toISOString(),
        open,
        high: Math.max(open, close) + 2,
        low: Math.min(open, close) - 2,
        close,
        volume: 50000
      });
      lastPrice = close;
    }
    return candles;
  }
}
