/**
 * Unit tests for signal detection.
 *
 * Tests the `detectSignals` function from `src/utils/signals.ts`,
 * which requires pre-computed MA and RSI values (passed as arguments).
 *
 * Golden cross logic: the crossover (MA5 <= MA10 at prev, MA5 > MA10 at current)
 * must happen at the very last valid index. Test data is designed accordingly.
 */

import { describe, it, expect } from 'vitest';
import { detectSignals } from '../../src/utils/signals.js';
import { calcMA, calcRSI, type OHLCV } from '../../src/utils/indicators.js';
import { goldenCrossData, volumeSpikeData, mockOHLCVData } from '../fixtures/test-data.js';

// ─── Helpers ────────────────────────────────────────────────────

/** Create a minimal OHLCV array from close prices and optional volumes. */
const makeData = (closes: number[], volumes?: number[]): OHLCV[] =>
  closes.map((c, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: volumes?.[i] ?? 1000000,
  }));

/**
 * Compute the latest MA and RSI values needed by detectSignals.
 */
function computeLatest(data: OHLCV[]) {
  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const rsi14 = calcRSI(data, 14);
  const lastIdx = data.length - 1;
  return {
    latestMA: { ma5: ma5[lastIdx], ma10: ma10[lastIdx] },
    latestRSI14: rsi14[lastIdx],
  };
}

// ─── Golden Cross ───────────────────────────────────────────────

describe('Golden Cross detection', () => {
  it('detects golden cross when MA5 crosses above MA10 at the last position', () => {
    // Design: 11 days. Days 0-8 decline slowly so MA5 stays below MA10.
    // Days 9-10 surge, pulling MA5 above MA10 exactly at the last index.
    //
    // Prices:  100, 99, 98, 97, 96, 95, 94, 93, 92, 105, 115
    // MA5 @9:  (95+94+93+92+105)/5 = 95.8
    // MA10 @9: (100+99+98+97+96+95+94+93+92+105)/10 = 96.9   → MA5 < MA10
    // MA5 @10: (94+93+92+105+115)/5 = 99.8
    // MA10 @10:(99+98+97+96+95+94+93+92+105+115)/10 = 98.4   → MA5 > MA10 (crossover!)
    const prices = [
      ...Array.from({ length: 9 }, (_, i) => 100 - i),  // 100,99,...,92
      105,
      115,
    ];
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.goldenCross).toBe(true);
  });

  it('does not detect golden cross in pure downtrend', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.goldenCross).toBe(false);
  });

  it('goldenCrossData fixture does NOT trigger golden cross at last position', () => {
    // goldenCrossData has 20 entries. The data dips then rises, so MA5
    // crosses above MA10 earlier (around index 12-13), NOT at the last
    // valid index. This test documents that the data does not trigger
    // a crossover at the terminal position.
    const { latestMA, latestRSI14 } = computeLatest(goldenCrossData);
    const signals = detectSignals(goldenCrossData, latestMA, latestRSI14);
    // Crossover happened earlier; both MAs are already above at the last index,
    // so goldenCross should be false (no new crossover at the terminal bar).
    expect(signals.goldenCross).toBe(false);
  });
});

// ─── Dead Cross ─────────────────────────────────────────────────

describe('Dead Cross detection', () => {
  it('detects dead cross when MA5 crosses below MA10 at the last position', () => {
    // Design: 11 days. Days 0-8 rise slowly so MA5 stays above MA10.
    // Days 9-10 crash, pulling MA5 below MA10 exactly at the last index.
    //
    // Prices:  80, 81, 82, 83, 84, 85, 86, 87, 88, 75, 65
    // MA5 @9:  (85+86+87+88+75)/5 = 84.2
    // MA10 @9: (80+81+82+83+84+85+86+87+88+75)/10 = 83.1  → MA5 > MA10
    // MA5 @10: (86+87+88+75+65)/5 = 80.2
    // MA10 @10:(81+82+83+84+85+86+87+88+75+65)/10 = 81.6  → MA5 < MA10 (crossover!)
    const prices = [
      ...Array.from({ length: 9 }, (_, i) => 80 + i),  // 80,81,...,88
      75,
      65,
    ];
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.deadCross).toBe(true);
  });

  it('does not detect dead cross in pure uptrend', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.deadCross).toBe(false);
  });
});

// ─── Overbought / Oversold ──────────────────────────────────────

describe('Overbought / Oversold detection', () => {
  it('detects overbought when RSI > 80 (strong uptrend)', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.overbought).toBe(true);
  });

  it('detects oversold when RSI < 20 (strong downtrend)', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 200 - i * 5);
    const data = makeData(prices);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.oversold).toBe(true);
  });
});

// ─── Volume Spike ───────────────────────────────────────────────

describe('Volume Spike detection', () => {
  it('detects volume spike with volumeSpikeData', () => {
    const { latestMA, latestRSI14 } = computeLatest(volumeSpikeData);
    const signals = detectSignals(volumeSpikeData, latestMA, latestRSI14);
    // Last volume = 5000000, previous 5 avg = 1000000, ratio = 5
    expect(signals.volumeSpike).toBe(true);
    expect(signals.volumeRatio).toBeCloseTo(5, 1);
  });

  it('does not detect spike when volume is normal', () => {
    const prices = Array.from({ length: 15 }, () => 100);
    const volumes = Array.from({ length: 15 }, () => 1000000);
    const data = makeData(prices, volumes);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.volumeSpike).toBe(false);
    expect(signals.volumeRatio).toBeCloseTo(1, 0);
  });

  it('returns no spike for insufficient data (< 6)', () => {
    const data = makeData([100, 100, 100]);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.volumeSpike).toBe(false);
    expect(signals.volumeRatio).toBe(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles empty data', () => {
    const signals = detectSignals([], { ma5: null, ma10: null }, null);
    expect(signals.goldenCross).toBe(false);
    expect(signals.deadCross).toBe(false);
    expect(signals.overbought).toBe(false);
    expect(signals.oversold).toBe(false);
    expect(signals.volumeSpike).toBe(false);
    expect(signals.volumeRatio).toBe(0);
  });

  it('handles single element', () => {
    const data = makeData([100]);
    const { latestMA, latestRSI14 } = computeLatest(data);
    const signals = detectSignals(data, latestMA, latestRSI14);
    expect(signals.goldenCross).toBe(false);
    expect(signals.volumeSpike).toBe(false);
    expect(signals.volumeRatio).toBe(0);
  });

  it('handles null latestMA gracefully', () => {
    const data = makeData([100, 101, 102, 103]);
    const signals = detectSignals(data, { ma5: null, ma10: null }, null);
    expect(signals.goldenCross).toBe(false);
    expect(signals.deadCross).toBe(false);
    expect(signals.overbought).toBe(false);
    expect(signals.oversold).toBe(false);
  });

  it('handles mockOHLCVData without error', () => {
    const { latestMA, latestRSI14 } = computeLatest(mockOHLCVData);
    const signals = detectSignals(mockOHLCVData, latestMA, latestRSI14);
    // Just ensure it runs without error and returns a valid Signals object
    expect(typeof signals.goldenCross).toBe('boolean');
    expect(typeof signals.deadCross).toBe('boolean');
    expect(typeof signals.overbought).toBe('boolean');
    expect(typeof signals.oversold).toBe('boolean');
    expect(typeof signals.volumeSpike).toBe('boolean');
    expect(typeof signals.volumeRatio).toBe('number');
  });
});
