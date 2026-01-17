
import { Candle, ColumnType, PNFColumn, PNFResult } from '../types';

/**
 * Calculate ATR (Average True Range)
 */
export const calculateATR = (candles: Candle[], length: number): number => {
  if (candles.length < length + 1) return candles[candles.length - 1]?.close * 0.01 || 1;

  let trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const latestTRs = trueRanges.slice(-length);
  return latestTRs.reduce((a, b) => a + b, 0) / length;
};

/**
 * Generate P&F Columns based on ATR Box Sizing
 */
export const generatePNF = (candles: Candle[], atrLength: number, reversal: number): PNFResult => {
  const boxSize = calculateATR(candles, atrLength);
  const columns: PNFColumn[] = [];

  if (candles.length === 0) return { columns: [], currentBoxSize: boxSize, lastUpdated: new Date().toISOString() };

  // Initialize first column
  let currentPrice = candles[0].close;
  let firstColType = candles[1] && candles[1].close > candles[0].close ? ColumnType.X : ColumnType.O;
  
  let currentColumn: PNFColumn = {
    type: firstColType,
    boxes: [Math.floor(currentPrice / boxSize) * boxSize],
    high: Math.floor(currentPrice / boxSize) * boxSize,
    low: Math.floor(currentPrice / boxSize) * boxSize
  };

  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].close;
    const highLimit = currentColumn.high + boxSize;
    const lowLimit = currentColumn.low - boxSize;
    const reversalLimitX = currentColumn.high - (boxSize * reversal);
    const reversalLimitO = currentColumn.low + (boxSize * reversal);

    if (currentColumn.type === ColumnType.X) {
      // Continue X column
      if (price >= highLimit) {
        const newHigh = Math.floor(price / boxSize) * boxSize;
        for (let b = currentColumn.high + boxSize; b <= newHigh; b += boxSize) {
          currentColumn.boxes.push(b);
        }
        currentColumn.high = newHigh;
      } 
      // Reverse to O column
      else if (price <= reversalLimitX) {
        columns.push({ ...currentColumn });
        const startPrice = currentColumn.high - boxSize;
        const endPrice = Math.floor(price / boxSize) * boxSize;
        const newBoxes: number[] = [];
        for (let b = startPrice; b >= endPrice; b -= boxSize) {
          newBoxes.push(b);
        }
        currentColumn = {
          type: ColumnType.O,
          boxes: newBoxes,
          high: startPrice,
          low: endPrice
        };
      }
    } else {
      // Continue O column
      if (price <= lowLimit) {
        const newLow = Math.floor(price / boxSize) * boxSize;
        for (let b = currentColumn.low - boxSize; b >= newLow; b -= boxSize) {
          currentColumn.boxes.push(b);
        }
        currentColumn.low = newLow;
      }
      // Reverse to X column
      else if (price >= reversalLimitO) {
        columns.push({ ...currentColumn });
        const startPrice = currentColumn.low + boxSize;
        const endPrice = Math.floor(price / boxSize) * boxSize;
        const newBoxes: number[] = [];
        for (let b = startPrice; b <= endPrice; b += boxSize) {
          newBoxes.push(b);
        }
        currentColumn = {
          type: ColumnType.X,
          boxes: newBoxes,
          high: endPrice,
          low: startPrice
        };
      }
    }
  }

  columns.push(currentColumn);

  return {
    columns,
    currentBoxSize: boxSize,
    lastUpdated: candles[candles.length - 1].date
  };
};
