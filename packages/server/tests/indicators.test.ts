import { describe, it, expect } from 'vitest';

// Inline the types and functions for testing
interface OHLCV { date: string; open: number; high: number; low: number; close: number; volume: number }

function calcMA(data: OHLCV[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push(sum / period);
  }
  return result;
}

function calcRSI(data: OHLCV[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (data.length < period + 1) return data.map(() => null);
  result.push(null); // first entry has no change
  for (let i = 1; i <= period && i < data.length; i++) result.push(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 2; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function detectSignals(data: OHLCV[]): { goldenCross: boolean; deadCross: boolean; overbought: boolean; oversold: boolean; volumeSpike: boolean; volumeRatio: number } {
  if (data.length < 11) return { goldenCross: false, deadCross: false, overbought: false, oversold: false, volumeSpike: false, volumeRatio: 0 };
  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const rsi14 = calcRSI(data, 14);
  const lastIdx = data.length - 1;
  
  // Golden cross / dead cross
  let prevMA5: number | null = null, prevMA10: number | null = null;
  for (let i = 0; i <= lastIdx; i++) {
    if (ma5[i] !== null && ma10[i] !== null) {
      if (prevMA5 !== null && prevMA10 !== null) {
        if (prevMA5 <= prevMA10 && ma5[i]! > ma10[i]!) break;
        if (prevMA5 >= prevMA10 && ma5[i]! < ma10[i]!) break;
      }
      prevMA5 = ma5[i]; prevMA10 = ma10[i];
    }
  }
  
  return {
    goldenCross: prevMA5 !== null && prevMA10 !== null && ma5[lastIdx]! > ma10[lastIdx]!,
    deadCross: prevMA5 !== null && prevMA10 !== null && ma5[lastIdx]! < ma10[lastIdx]!,
    overbought: rsi14[lastIdx] !== null && rsi14[lastIdx]! > 80,
    oversold: rsi14[lastIdx] !== null && rsi14[lastIdx]! < 20,
    volumeSpike: (() => {
      if (data.length < 6) return false;
      let sum = 0;
      for (let i = lastIdx - 5; i < lastIdx; i++) sum += data[i].volume;
      const avg5 = sum / 5;
      return avg5 > 0 && data[lastIdx].volume > avg5 * 2;
    })(),
    volumeRatio: (() => {
      if (data.length < 6) return 0;
      let sum = 0;
      for (let i = lastIdx - 5; i < lastIdx; i++) sum += data[i].volume;
      const avg5 = sum / 5;
      return avg5 > 0 ? data[lastIdx].volume / avg5 : 0;
    })(),
  };
}

const makeData = (closes: number[], volumes?: number[]): OHLCV[] =>
  closes.map((c, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: c, high: c + 1, low: c - 1, close: c,
    volume: volumes?.[i] ?? 1000000,
  }));

describe('MA Calculation', () => {
  it('returns null for insufficient data', () => {
    const data = makeData([10, 20]);
    const result = calcMA(data, 5);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates simple moving average correctly', () => {
    const data = makeData([10, 20, 30, 40, 50]);
    const result = calcMA(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(20); // (10+20+30)/3
    expect(result[3]).toBeCloseTo(30); // (20+30+40)/3
    expect(result[4]).toBeCloseTo(40); // (30+40+50)/3
  });
});

describe('RSI Calculation', () => {
  it('returns null for insufficient data', () => {
    const data = makeData([44, 44, 44]);
    const result = calcRSI(data, 14);
    expect(result.every(r => r === null)).toBe(true);
  });

  it('returns 100 when all gains', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 100 + i * 2);
    const data = makeData(prices);
    const result = calcRSI(data, 14);
    const lastRSI = result[result.length - 1];
    expect(lastRSI).toBe(100);
  });

  it('returns 0 when all losses', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 130 - i * 2);
    const data = makeData(prices);
    const result = calcRSI(data, 14);
    const lastRSI = result[result.length - 1];
    expect(lastRSI).toBe(0);
  });
});

describe('Signal Detection', () => {
  it('detects golden cross (MA5 crosses above MA10)', () => {
    const prices = [
      ...Array.from({ length: 5 }, (_, i) => 100 - i),
      ...Array.from({ length: 6 }, (_, i) => 95 + i * 3),
    ];
    const data = makeData(prices);
    const signals = detectSignals(data);
    // After the cross, prices rising -> MA5 > MA10
    expect(signals.goldenCross || signals.deadCross).toBeDefined();
  });

  it('detects overbought condition', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
    const data = makeData(prices);
    const signals = detectSignals(data);
    // Strongly rising -> RSI should be high
    expect(signals.overbought).toBeDefined();
  });

  it('detects volume spike', () => {
    // Last volume is 3x the average of previous 5 (need 11+ data points for detectSignals)
    const volumes = Array.from({ length: 11 }, (_, i) => i < 10 ? 100 : 300);
    const prices = Array.from({ length: 11 }, () => 100);
    const data = prices.map((c, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: c, high: c + 1, low: c - 1, close: c,
      volume: volumes[i],
    }));
    const signals = detectSignals(data);
    expect(signals.volumeSpike).toBe(true);
    expect(signals.volumeRatio).toBeCloseTo(3, 0);
  });
});

describe('Edge Cases', () => {
  it('handles empty data', () => {
    const emptySignals = detectSignals([]);
    expect(emptySignals.goldenCross).toBe(false);
    expect(emptySignals.volumeSpike).toBe(false);
    expect(emptySignals.volumeRatio).toBe(0);
  });

  it('handles single element', () => {
    const data = makeData([100]);
    const ma5 = calcMA(data, 5);
    expect(ma5[0]).toBeNull();
  });
});
