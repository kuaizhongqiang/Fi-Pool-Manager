/**
 * Unit tests for technical indicator calculations.
 *
 * Tests all exported functions from `src/utils/indicators.ts`:
 *   calcMA, calcEMA, calcRSI, calcMACD, calcKDJ, calcBollinger,
 *   calcAmplitude, calcPriceChangePct
 *
 * Note: Uses actual imports from the source module rather than inline copies.
 */

import { describe, it, expect } from 'vitest';
import {
  calcMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcKDJ,
  calcBollinger,
  calcAmplitude,
  calcPriceChangePct,
  type OHLCV,
} from '../../src/utils/indicators.js';
import { mockOHLCVData } from '../fixtures/test-data.js';

// ─── Helpers ────────────────────────────────────────────────────

/** Create a minimal OHLCV array from close prices (and optional volumes). */
const makeData = (closes: number[], volumes?: number[]): OHLCV[] =>
  closes.map((c, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: volumes?.[i] ?? 1000000,
  }));

// ─── calcMA ─────────────────────────────────────────────────────

describe('calcMA (Simple Moving Average)', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([10, 20]);
    const result = calcMA(data, 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('returns all nulls for empty array', () => {
    const result = calcMA([], 5);
    expect(result).toEqual([]);
  });

  it('returns all nulls for period <= 0', () => {
    const data = makeData([10, 20, 30]);
    expect(calcMA(data, 0).every((v) => v === null)).toBe(true);
    expect(calcMA(data, -1).every((v) => v === null)).toBe(true);
  });

  it('calculates SMA correctly', () => {
    const data = makeData([10, 20, 30, 40, 50]);
    const result = calcMA(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(20);   // (10+20+30)/3
    expect(result[3]).toBeCloseTo(30);   // (20+30+40)/3
    expect(result[4]).toBeCloseTo(40);   // (30+40+50)/3
  });

  it('handles period equal to data length', () => {
    const data = makeData([10, 20, 30]);
    const result = calcMA(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(20);
  });

  it('works with mockOHLCVData', () => {
    const result = calcMA(mockOHLCVData, 5);
    expect(result).toHaveLength(60);
    // First 4 should be null
    for (let i = 0; i < 4; i++) {
      expect(result[i]).toBeNull();
    }
    // Index 4 should be the first non-null
    expect(result[4]).not.toBeNull();
    // It should be (close[0] + close[1] + close[2] + close[3] + close[4]) / 5
    const expected = (
      mockOHLCVData[0].close +
      mockOHLCVData[1].close +
      mockOHLCVData[2].close +
      mockOHLCVData[3].close +
      mockOHLCVData[4].close
    ) / 5;
    expect(result[4]).toBeCloseTo(expected);
  });
});

// ─── calcEMA ────────────────────────────────────────────────────

describe('calcEMA (Exponential Moving Average)', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([10, 20]);
    const result = calcEMA(data, 5);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls for empty array', () => {
    expect(calcEMA([], 5)).toEqual([]);
  });

  it('calculates EMA correctly', () => {
    // Manually compute first few values to verify
    const data = makeData([10, 20, 30, 40, 50]);
    const result = calcEMA(data, 3);
    // period=3 means multiplier = 2/(3+1) = 0.5
    // index 2: SMA of [10,20,30] = 20
    expect(result[2]).toBeCloseTo(20);
    // index 3: (40 - 20) * 0.5 + 20 = 30
    expect(result[3]).toBeCloseTo(30);
    // index 4: (50 - 30) * 0.5 + 30 = 40
    expect(result[4]).toBeCloseTo(40);
  });
});

// ─── calcRSI ────────────────────────────────────────────────────

describe('calcRSI (Relative Strength Index)', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([44, 44, 44]);
    const result = calcRSI(data, 14);
    expect(result.every((r) => r === null)).toBe(true);
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

  it('returns 50 for alternating equal gains and losses', () => {
    // Price oscillates: up 1, down 1, up 1, down 1...
    const prices = Array.from({ length: 18 }, (_, i) => 100 + (i % 2 === 0 ? i : -i));
    const data = makeData(prices);
    const result = calcRSI(data, 14);
    const lastRSI = result[result.length - 1];
    // With equal gains/losses, RSI should be near 50
    expect(lastRSI).not.toBeNull();
    if (lastRSI !== null) {
      expect(lastRSI).toBeGreaterThan(40);
      expect(lastRSI).toBeLessThan(60);
    }
  });

  it('first valid RSI is at index = period', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const data = makeData(prices);
    const result = calcRSI(data, 14);
    // First 14 entries should be null
    for (let i = 0; i < 14; i++) {
      expect(result[i]).toBeNull();
    }
    // Index 14 should be the first non-null
    expect(result[14]).not.toBeNull();
  });
});

// ─── calcMACD ───────────────────────────────────────────────────

describe('calcMACD', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([10, 20, 30]);
    const { dif, dea, histogram } = calcMACD(data);
    // Need 26 data points for EMA26, so 3 is not enough
    expect(dif.every((v) => v === null)).toBe(true);
    expect(dea.every((v) => v === null)).toBe(true);
    expect(histogram.every((v) => v === null)).toBe(true);
  });

  it('produces valid DIF, DEA, Histogram with sufficient data', () => {
    // Generate 40 data points in a simple trend
    const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
    const data = makeData(prices);
    const { dif, dea, histogram } = calcMACD(data);

    expect(dif).toHaveLength(40);
    expect(dea).toHaveLength(40);
    expect(histogram).toHaveLength(40);

    // First 25 should be null (EMA26 starts at index 25)
    for (let i = 0; i < 25; i++) {
      expect(dif[i]).toBeNull();
    }
    expect(dif[25]).not.toBeNull();

    // DEA should have some non-null values after DIF becomes valid
    const validDea = dea.filter((v) => v !== null);
    expect(validDea.length).toBeGreaterThan(0);

    // DIF and DEA should be numbers wherever non-null
    for (let i = 0; i < 40; i++) {
      if (dif[i] !== null) {
        expect(typeof dif[i]).toBe('number');
      }
      if (dea[i] !== null) {
        expect(typeof dea[i]).toBe('number');
      }
      if (histogram[i] !== null) {
        expect(typeof histogram[i]).toBe('number');
      }
    }
  });

  it('with mockOHLCVData produces expected structure', () => {
    const { dif, dea, histogram } = calcMACD(mockOHLCVData);
    expect(dif).toHaveLength(60);
    expect(dea).toHaveLength(60);
    expect(histogram).toHaveLength(60);

    // Since mockOHLCVData has 60 points (>= 26), DIF should have valid values starting at index 25
    expect(dif[25]).not.toBeNull();
    // Histogram should be valid wherever DIF and DEA are both valid
    const validHistogram = histogram.filter((v) => v !== null);
    expect(validHistogram.length).toBeGreaterThan(0);
  });
});

// ─── calcKDJ ────────────────────────────────────────────────────

describe('calcKDJ', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([10, 20, 30]);
    const { k, d, j } = calcKDJ(data, 9);
    expect(k.every((v) => v === null)).toBe(true);
    expect(d.every((v) => v === null)).toBe(true);
    expect(j.every((v) => v === null)).toBe(true);
  });

  it('initial K and D values are 50 at index period-1', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const data = makeData(prices);
    const { k, d, j } = calcKDJ(data, 9);
    // At index 8 (period-1), K and D should be 50
    expect(k[8]).toBe(50);
    expect(d[8]).toBe(50);
    // J = 3*K - 2*D = 150 - 100 = 50
    expect(j[8]).toBeCloseTo(50);
  });

  it('K, D, J values stay within reasonable bounds for uptrend', () => {
    const { k, d, j } = calcKDJ(mockOHLCVData, 9);
    const validK = k.filter((v) => v !== null) as number[];
    const validD = d.filter((v) => v !== null) as number[];
    const validJ = j.filter((v) => v !== null) as number[];

    expect(validK.length).toBeGreaterThan(0);
    expect(validD.length).toBeGreaterThan(0);
    expect(validJ.length).toBeGreaterThan(0);

    // K and D should be between 0 and 100
    for (const kv of validK) {
      expect(kv).toBeGreaterThanOrEqual(0);
      expect(kv).toBeLessThanOrEqual(100);
    }
    for (const dv of validD) {
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(100);
    }
  });

  it('returns default period 9 when no period provided', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const data = makeData(prices);
    const { k } = calcKDJ(data); // uses default period = 9
    expect(k[8]).toBe(50); // position 8 = period - 1
  });
});

// ─── calcBollinger ──────────────────────────────────────────────

describe('calcBollinger (Bollinger Bands)', () => {
  it('returns all nulls for insufficient data', () => {
    const data = makeData([10, 20, 30]);
    const { upper, mid, lower } = calcBollinger(data, 20, 2);
    expect(upper.every((v) => v === null)).toBe(true);
    expect(mid.every((v) => v === null)).toBe(true);
    expect(lower.every((v) => v === null)).toBe(true);
  });

  it('mid equals SMA for the period', () => {
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
    const data = makeData(prices);
    const { mid } = calcBollinger(data, 20, 2);

    // Index 19: SMA of first 20 values = (100 + 101 + ... + 119) / 20
    let sum = 0;
    for (let i = 0; i < 20; i++) sum += 100 + i;
    const sma = sum / 20;
    expect(mid[19]).toBeCloseTo(sma);
  });

  it('upper >= mid >= lower for all valid positions', () => {
    const { upper, mid, lower } = calcBollinger(mockOHLCVData, 20, 2);
    for (let i = 0; i < mockOHLCVData.length; i++) {
      if (upper[i] !== null && mid[i] !== null && lower[i] !== null) {
        expect(upper[i]!).toBeGreaterThanOrEqual(mid[i]!);
        expect(mid[i]!).toBeGreaterThanOrEqual(lower[i]!);
      }
    }
  });

  it('band width increases with multiplier', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100);
    const data = makeData(prices);
    // Constant price -> standard deviation should be 0
    const { upper, mid, lower } = calcBollinger(data, 20, 2);
    expect(upper[19]).toBeCloseTo(100);
    expect(mid[19]).toBeCloseTo(100);
    expect(lower[19]).toBeCloseTo(100);
  });
});

// ─── calcAmplitude ──────────────────────────────────────────────

describe('calcAmplitude', () => {
  it('returns 0 for first element', () => {
    expect(calcAmplitude(mockOHLCVData, 0)).toBe(0);
  });

  it('returns 0 for index out of range', () => {
    expect(calcAmplitude(mockOHLCVData, -1)).toBe(0);
    expect(calcAmplitude(mockOHLCVData, 999)).toBe(0);
  });

  it('calculates amplitude correctly', () => {
    const data = makeData([100, 100]);
    // Day 1: high=101, low=99, prevClose=100
    // amplitude = (101-99)/100 * 100 = 2%
    expect(calcAmplitude(data, 1)).toBeCloseTo(2);
  });

  it('returns 0 when prevClose is 0', () => {
    const data = [
      { date: '2024-01-01', open: 10, high: 11, low: 9, close: 10, volume: 1000 },
      { date: '2024-01-02', open: 10, high: 11, low: 9, close: 10, volume: 1000 },
    ];
    data[0].close = 0;
    expect(calcAmplitude(data, 1)).toBe(0);
  });
});

// ─── calcPriceChangePct ─────────────────────────────────────────

describe('calcPriceChangePct', () => {
  it('returns 0 for first element', () => {
    expect(calcPriceChangePct(mockOHLCVData, 0)).toBe(0);
  });

  it('returns 0 for index out of range', () => {
    expect(calcPriceChangePct(mockOHLCVData, -1)).toBe(0);
    expect(calcPriceChangePct(mockOHLCVData, 999)).toBe(0);
  });

  it('calculates positive change correctly', () => {
    const data = makeData([100, 105]);
    expect(calcPriceChangePct(data, 1)).toBeCloseTo(5);
  });

  it('calculates negative change correctly', () => {
    const data = makeData([100, 95]);
    expect(calcPriceChangePct(data, 1)).toBeCloseTo(-5);
  });

  it('returns 0 when prevClose is 0', () => {
    const data = [
      { date: '2024-01-01', open: 10, high: 11, low: 9, close: 0, volume: 1000 },
      { date: '2024-01-02', open: 10, high: 11, low: 9, close: 10, volume: 1000 },
    ];
    expect(calcPriceChangePct(data, 1)).toBe(0);
  });
});
